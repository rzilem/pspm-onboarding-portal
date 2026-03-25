/**
 * GET /api/signature-requests/[id]
 *
 * Returns the signature request with all signers and their statuses.
 * Used by CRM to poll for completion status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';

interface SignatureRequest {
  id: string;
  source_system: string;
  source_ref: string | null;
  status: string;
  document_title: string;
  pdf_url: string;
  pdf_storage_path: string | null;
  signed_pdf_path: string | null;
  callback_url: string;
  metadata: Record<string, unknown> | null;
  hash_chain: Array<{ version: string; sha256: string; timestamp: string }>;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
}

interface Signer {
  id: string;
  name: string;
  email: string;
  role: string;
  sign_order: number;
  is_internal: boolean;
  status: string;
  signed_at: string | null;
  signature_type: string | null;
  notified_at: string | null;
  viewed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req, 'SIGNATURE_API_KEY');
  if (authError) return authError;

  const { id: requestId } = await params;

  try {
    // -------------------------------------------------------
    // Fetch signature request
    // -------------------------------------------------------
    const requests = await supabaseRest<SignatureRequest[]>(
      `signature_requests?id=eq.${encodeURIComponent(requestId)}&limit=1`,
    );

    if (!requests.length) {
      return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });
    }

    const request = requests[0];

    // -------------------------------------------------------
    // Fetch all signers (excluding sensitive fields)
    // -------------------------------------------------------
    const signers = await supabaseRest<Signer[]>(
      `signature_request_signers?request_id=eq.${encodeURIComponent(requestId)}&select=id,name,email,role,sign_order,is_internal,status,signed_at,signature_type,notified_at,viewed_at,declined_at,decline_reason,created_at&order=sign_order,created_at`,
    );

    // -------------------------------------------------------
    // Compute summary
    // -------------------------------------------------------
    const totalSigners = signers.length;
    const signedCount = signers.filter((s) => s.status === 'signed').length;
    const declinedCount = signers.filter((s) => s.status === 'declined').length;
    const pendingCount = signers.filter((s) => ['pending', 'notified', 'viewed'].includes(s.status)).length;

    return NextResponse.json({
      id: request.id,
      source_system: request.source_system,
      source_ref: request.source_ref,
      status: request.status,
      document_title: request.document_title,
      metadata: request.metadata,
      hash_chain: request.hash_chain,
      expires_at: request.expires_at,
      completed_at: request.completed_at,
      created_at: request.created_at,
      summary: {
        total_signers: totalSigners,
        signed: signedCount,
        declined: declinedCount,
        pending: pendingCount,
      },
      signers: signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        sign_order: s.sign_order,
        is_internal: s.is_internal,
        status: s.status,
        signed_at: s.signed_at,
        signature_type: s.signature_type,
        notified_at: s.notified_at,
        viewed_at: s.viewed_at,
        declined_at: s.declined_at,
        decline_reason: s.decline_reason,
      })),
    });
  } catch (err) {
    console.error('[signature-requests/[id]] GET error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
