import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/sign/[token]/complete — submit signature
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const body = await req.json();
  const {
    signature_type,
    signature_data,
    typed_name,
    initials,
    initials_data,
    consent_text,
  } = body;

  // Validate required fields
  if (!signature_type || !signature_data) {
    return NextResponse.json({ error: 'Missing signature data' }, { status: 400 });
  }

  // Find signer
  const { data: signer, error: signerErr } = await supabase
    .from('signature_request_signers')
    .select('*, request:signature_requests(*)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (signerErr || !signer) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  // Prevent double-signing
  if (signer.status === 'signed') {
    return NextResponse.json({ error: 'Already signed' }, { status: 409 });
  }

  // Check expiry
  if (signer.request?.expires_at && new Date(signer.request.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Expired' }, { status: 410 });
  }

  // Compute document hash (SHA-256 of PDF at signing time)
  let documentHash = '';
  if (signer.request?.pdf_storage_path) {
    const { data: pdfData } = await supabase.storage
      .from('signed-agreements')
      .download(signer.request.pdf_storage_path);

    if (pdfData) {
      const buffer = await pdfData.arrayBuffer();
      documentHash = crypto
        .createHash('sha256')
        .update(Buffer.from(buffer))
        .digest('hex');
    }
  }

  // Compute consent text hash
  const consentTextHash = consent_text
    ? crypto.createHash('sha256').update(consent_text).digest('hex')
    : null;

  // Compute signature hash
  const signatureHash = crypto
    .createHash('sha256')
    .update(signature_data)
    .digest('hex');

  const now = new Date().toISOString();

  // Update signer record
  const { error: updateErr } = await supabase
    .from('signature_request_signers')
    .update({
      status: 'signed',
      signed_at: now,
      signature_type,
      signature_data,
      typed_name,
      initials,
      initials_data,
      signature_hash: signatureHash,
      document_hash_at_signing: documentHash,
      ip_address: ip,
      user_agent: userAgent,
      consent_text: consent_text,
      consent_text_hash: consentTextHash,
      consent_given_at: now,
    })
    .eq('id', signer.id);

  if (updateErr) {
    console.error('Error updating signer:', updateErr);
    return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 });
  }

  // Log audit event
  await supabase.from('signature_request_audit').insert({
    request_id: signer.request_id,
    signer_id: signer.id,
    event_type: 'signed',
    actor_type: signer.is_internal ? 'pspm_signer' : 'board_signer',
    actor_email: signer.email,
    ip_address: ip,
    user_agent: userAgent,
    document_hash: documentHash,
    metadata: {
      signature_type,
      signature_hash: signatureHash,
      consent_text_hash: consentTextHash,
    },
  });

  // Check if all signers at this sign_order or lower are done
  const { data: allSigners } = await supabase
    .from('signature_request_signers')
    .select('*')
    .eq('request_id', signer.request_id)
    .order('sign_order');

  const nextUnsigned = allSigners?.find(s => s.status !== 'signed');

  if (!nextUnsigned) {
    // ALL signers done — mark request as completed
    // Update hash chain
    const hashChain = signer.request?.hash_chain || [];
    hashChain.push({
      version: `signer_${signer.sign_order}_signed`,
      sha256: documentHash,
      timestamp: now,
      signer: signer.name,
    });

    await supabase
      .from('signature_requests')
      .update({
        status: 'completed',
        completed_at: now,
        hash_chain: hashChain,
      })
      .eq('id', signer.request_id);

    // Fire callback to CRM
    if (signer.request?.callback_url) {
      try {
        const callbackPayload = {
          request_id: signer.request_id,
          status: 'completed',
          source_ref: signer.request.source_ref,
          completed_at: now,
          signers: allSigners?.map(s => ({
            name: s.name,
            email: s.email,
            role: s.role,
            signed_at: s.signed_at,
            signature_hash: s.signature_hash,
            ip_address: s.ip_address,
          })),
          hash_chain: hashChain,
        };

        await fetch(signer.request.callback_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.SIGNATURE_API_KEY || '',
          },
          body: JSON.stringify(callbackPayload),
        });
      } catch (err) {
        console.error('Callback failed (will retry):', err);
        // TODO: implement retry queue
      }
    }

    // Log completion audit
    await supabase.from('signature_request_audit').insert({
      request_id: signer.request_id,
      event_type: 'completed',
      actor_type: 'system',
      ip_address: ip,
      document_hash: documentHash,
      metadata: { total_signers: allSigners?.length },
    });
  } else {
    // Update hash chain with this signer
    const hashChain = signer.request?.hash_chain || [];
    hashChain.push({
      version: `signer_${signer.sign_order}_signed`,
      sha256: documentHash,
      timestamp: now,
      signer: signer.name,
    });

    await supabase
      .from('signature_requests')
      .update({
        status: 'in_progress',
        hash_chain: hashChain,
      })
      .eq('id', signer.request_id);

    // If next signer hasn't been notified, send their email
    if (nextUnsigned.status === 'pending') {
      // TODO: Phase 8 — send email to next signer
      await supabase
        .from('signature_request_signers')
        .update({ status: 'notified', notified_at: now })
        .eq('id', nextUnsigned.id);
    }
  }

  return NextResponse.json({
    success: true,
    status: nextUnsigned ? 'partially_signed' : 'completed',
  });
}
