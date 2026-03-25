import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/sign/[token] — fetch signer info for signing page
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Hash the token to look up in DB
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Find the signer by token hash
  const { data: signer, error: signerError } = await supabase
    .from('signature_request_signers')
    .select('*, request:signature_requests(*)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (signerError || !signer) {
    return NextResponse.json({ error: 'Invalid signing link' }, { status: 404 });
  }

  // Check if already signed
  if (signer.status === 'signed') {
    return NextResponse.json({ error: 'Already signed' }, { status: 410 });
  }

  // Check expiry
  if (signer.request?.expires_at && new Date(signer.request.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 404 });
  }

  // Check if request is cancelled
  if (signer.request?.status === 'cancelled') {
    return NextResponse.json({ error: 'Request cancelled' }, { status: 404 });
  }

  // Get all signers for status display
  const { data: allSigners } = await supabase
    .from('signature_request_signers')
    .select('name, status, is_internal')
    .eq('request_id', signer.request_id)
    .order('sign_order');

  // Generate signed URL for the PDF
  let pdfUrl = '';
  if (signer.request?.pdf_storage_path) {
    const { data: urlData } = await supabase.storage
      .from('signed-agreements')
      .createSignedUrl(signer.request.pdf_storage_path, 3600);
    pdfUrl = urlData?.signedUrl || '';
  }

  return NextResponse.json({
    id: signer.id,
    name: signer.name,
    email: signer.email,
    role: signer.role,
    sign_order: signer.sign_order,
    status: signer.status,
    document_title: signer.request?.document_title || 'Management Agreement',
    pdf_url: pdfUrl,
    all_signers: allSigners || [],
  });
}
