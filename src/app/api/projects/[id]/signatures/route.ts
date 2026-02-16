import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { sendSignatureRequest } from '@/lib/email';
import type { Signature, Project, Document } from '@/lib/types';

/**
 * GET /api/projects/[id]/signatures — List signatures for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const signatures = await supabaseRest<Signature[]>(
      `onboarding_signatures?project_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc`,
    );

    return NextResponse.json(signatures);
  } catch (err) {
    console.error('[api/projects/[id]/signatures] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[id]/signatures — Request a new signature
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();

    const {
      task_id,
      document_id,
      signer_name,
      signer_email,
      signer_title,
      signer_company,
    } = body;

    if (!signer_name) {
      return NextResponse.json({ error: 'signer_name is required' }, { status: 400 });
    }

    const signaturePayload = {
      project_id: id,
      task_id: task_id || null,
      document_id: document_id || null,
      signer_name,
      signer_email: signer_email || null,
      signer_title: signer_title || null,
      signer_company: signer_company || null,
      status: 'pending',
    };

    const [created] = await supabaseRest<Signature[]>('onboarding_signatures', {
      method: 'POST',
      body: JSON.stringify(signaturePayload),
      prefer: 'return=representation',
    });

    // Send signature request email if signer has email
    if (signer_email) {
      // Fetch project for portal token and name
      const [project] = await supabaseRest<Project[]>(
        `onboarding_projects?id=eq.${encodeURIComponent(id)}&select=name,public_token`,
      );

      if (project) {
        // Fetch document name if document_id provided
        let documentName: string | undefined;
        if (document_id) {
          const [doc] = await supabaseRest<Document[]>(
            `onboarding_documents?id=eq.${encodeURIComponent(document_id)}&select=name`,
          );
          documentName = doc?.name;
        }

        // Send email (fire-and-forget)
        sendSignatureRequest({
          to: signer_email,
          signerName: signer_name,
          projectName: project.name,
          documentName,
          portalToken: project.public_token,
          signatureId: created.id,
          project_id: id,
        }).catch((err) => {
          console.error('[signatures] Failed to send signature request email:', err);
        });
      }
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      task_id: task_id || undefined,
      actor: 'system',
      actor_type: 'staff',
      action: 'signature_requested',
      details: {
        signer_name,
        signer_email: signer_email || null,
        document_id: document_id || null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/projects/[id]/signatures] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
