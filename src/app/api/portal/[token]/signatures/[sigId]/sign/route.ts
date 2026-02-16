import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { validatePortalToken } from '@/lib/auth';
import type { Signature, Task } from '@/lib/types';

const CONSENT_TEXT =
  'I agree to sign this document electronically and acknowledge that my electronic signature has the same legal effect as a handwritten signature.';

interface SignRequestBody {
  signature_type: 'draw' | 'type';
  signature_data?: string;
  typed_name?: string;
  signer_name: string;
  signer_email?: string;
  signer_title?: string;
  consent_given: boolean;
}

/**
 * POST /api/portal/[token]/signatures/[sigId]/sign
 * Client signs a document electronically.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; sigId: string }> },
) {
  const { token, sigId } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  // Fetch the signature record and verify it belongs to this project
  let signature: Signature;
  try {
    const signatures = await supabaseRest<Signature[]>(
      `onboarding_signatures?id=eq.${sigId}&project_id=eq.${project.id}&select=*&limit=1`,
    );

    if (!signatures.length) {
      return NextResponse.json(
        { error: 'Signature not found or does not belong to this project' },
        { status: 404 },
      );
    }
    signature = signatures[0];
  } catch (err) {
    console.error('[portal/sign] Failed to fetch signature:', err);
    return NextResponse.json({ error: 'Failed to fetch signature' }, { status: 500 });
  }

  // Verify signature is in a signable state
  const signableStatuses: string[] = ['pending', 'sent', 'viewed'];
  if (!signableStatuses.includes(signature.status)) {
    return NextResponse.json(
      { error: `Signature has already been ${signature.status}` },
      { status: 400 },
    );
  }

  // Parse request body
  let body: SignRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (!body.signer_name || typeof body.signer_name !== 'string') {
    return NextResponse.json({ error: 'signer_name is required' }, { status: 400 });
  }

  if (!body.signature_type || !['draw', 'type'].includes(body.signature_type)) {
    return NextResponse.json(
      { error: 'signature_type must be "draw" or "type"' },
      { status: 400 },
    );
  }

  if (body.signature_type === 'draw' && !body.signature_data) {
    return NextResponse.json(
      { error: 'signature_data is required for draw signatures' },
      { status: 400 },
    );
  }

  if (body.signature_type === 'type' && !body.typed_name) {
    return NextResponse.json(
      { error: 'typed_name is required for typed signatures' },
      { status: 400 },
    );
  }

  if (!body.consent_given) {
    return NextResponse.json(
      { error: 'Consent must be given to sign electronically' },
      { status: 400 },
    );
  }

  // Capture metadata
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const now = new Date().toISOString();

  try {
    // Update the signature record
    const signatureUpdate: Record<string, unknown> = {
      signature_type: body.signature_type,
      signer_name: body.signer_name,
      ip_address: ipAddress,
      user_agent: userAgent,
      consent_text: CONSENT_TEXT,
      consent_given_at: now,
      status: 'signed',
      signed_at: now,
    };

    if (body.signature_type === 'draw') {
      signatureUpdate.signature_data = body.signature_data;
    } else {
      signatureUpdate.typed_name = body.typed_name;
    }

    if (body.signer_email) {
      signatureUpdate.signer_email = body.signer_email;
    }

    if (body.signer_title) {
      signatureUpdate.signer_title = body.signer_title;
    }

    const [updatedSignature] = await supabaseRest<Signature[]>(
      `onboarding_signatures?id=eq.${sigId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(signatureUpdate),
        prefer: 'return=representation',
      },
    );

    // Insert audit record
    await supabaseRest(
      'onboarding_signature_audit',
      {
        method: 'POST',
        body: JSON.stringify({
          signature_id: sigId,
          event_type: 'signed',
          event_data: {
            signer_name: body.signer_name,
            signature_type: body.signature_type,
            ip_address: ipAddress,
            user_agent: userAgent,
          },
          ip_address: ipAddress,
          user_agent: userAgent,
        }),
        prefer: 'return=minimal',
      },
    );

    // If linked to a task, mark that task as completed
    if (signature.task_id) {
      try {
        const tasks = await supabaseRest<Task[]>(
          `onboarding_tasks?id=eq.${signature.task_id}&project_id=eq.${project.id}&select=id,status&limit=1`,
        );

        if (tasks.length && tasks[0].status !== 'completed') {
          await supabaseRest(
            `onboarding_tasks?id=eq.${signature.task_id}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'completed',
                completed_at: now,
                completed_by: 'client',
                updated_at: now,
              }),
              prefer: 'return=minimal',
            },
          );

          logActivity({
            project_id: project.id,
            task_id: signature.task_id,
            actor: body.signer_name,
            actor_type: 'client',
            action: 'task_completed',
            details: { reason: 'document_signed', signature_id: sigId },
          });
        }
      } catch (err) {
        // Non-fatal — signature was recorded, task update is secondary
        console.error('[portal/sign] Failed to update linked task:', err);
      }
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: project.id,
      task_id: signature.task_id || undefined,
      actor: body.signer_name,
      actor_type: 'client',
      action: 'document_signed',
      details: {
        signature_id: sigId,
        signature_type: body.signature_type,
        document_id: signature.document_id,
      },
    });

    return NextResponse.json(updatedSignature);
  } catch (err) {
    console.error('[portal/sign] Failed to process signature:', err);
    return NextResponse.json({ error: 'Failed to process signature' }, { status: 500 });
  }
}
