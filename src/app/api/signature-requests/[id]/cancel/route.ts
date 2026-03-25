/**
 * POST /api/signature-requests/[id]/cancel
 *
 * Cancels a signature request:
 * - Sets request status to 'cancelled'
 * - Nullifies all signer token hashes (invalidates signing links)
 * - Logs audit event
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';

interface SignatureRequest {
  id: string;
  status: string;
  document_title: string;
}

interface Signer {
  id: string;
  name: string;
  email: string;
  status: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req, 'SIGNATURE_API_KEY');
  if (authError) return authError;

  const { id: requestId } = await params;

  try {
    // -------------------------------------------------------
    // Fetch the signature request
    // -------------------------------------------------------
    const requests = await supabaseRest<SignatureRequest[]>(
      `signature_requests?id=eq.${encodeURIComponent(requestId)}&select=id,status,document_title&limit=1`,
    );

    if (!requests.length) {
      return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });
    }

    const request = requests[0];

    if (request.status === 'cancelled') {
      return NextResponse.json({ error: 'Signature request is already cancelled' }, { status: 409 });
    }
    if (request.status === 'completed') {
      return NextResponse.json({ error: 'Cannot cancel a completed signature request' }, { status: 409 });
    }

    // -------------------------------------------------------
    // Parse optional cancellation reason from body
    // -------------------------------------------------------
    let reason: string | null = null;
    let actorEmail: string | null = null;
    try {
      const body = await req.json();
      reason = body.reason || null;
      actorEmail = body.actor_email || null;
    } catch {
      // Empty body is fine
    }

    // -------------------------------------------------------
    // Fetch all signers
    // -------------------------------------------------------
    const signers = await supabaseRest<Signer[]>(
      `signature_request_signers?request_id=eq.${encodeURIComponent(requestId)}&select=id,name,email,status`,
    );

    // -------------------------------------------------------
    // Nullify all signer token hashes (invalidates signing URLs)
    // token_hash has a UNIQUE constraint, so each must be unique
    // -------------------------------------------------------
    for (const signer of signers) {
      await supabaseRest(
        `signature_request_signers?id=eq.${encodeURIComponent(signer.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            token_hash: `cancelled_${signer.id}_${Date.now()}`,
          }),
          prefer: 'return=minimal',
        },
      );
    }

    // -------------------------------------------------------
    // Update request status to 'cancelled'
    // -------------------------------------------------------
    await supabaseRest(
      `signature_requests?id=eq.${encodeURIComponent(requestId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
        prefer: 'return=minimal',
      },
    );

    // -------------------------------------------------------
    // Log audit event
    // -------------------------------------------------------
    await supabaseRest('signature_request_audit', {
      method: 'POST',
      body: JSON.stringify({
        request_id: requestId,
        event_type: 'request_cancelled',
        actor_type: actorEmail ? 'user' : 'system',
        actor_email: actorEmail,
        metadata: {
          reason,
          previous_status: request.status,
          signers_affected: signers.length,
          signers_signed: signers.filter((s) => s.status === 'signed').length,
        },
      }),
      prefer: 'return=minimal',
    });

    return NextResponse.json({
      id: requestId,
      status: 'cancelled',
      document_title: request.document_title,
      signers_invalidated: signers.length,
    });
  } catch (err) {
    console.error('[signature-requests/cancel] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
