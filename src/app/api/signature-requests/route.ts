/**
 * POST /api/signature-requests
 *
 * Create an external signature request from CRM or other systems.
 * Downloads the PDF, computes SHA-256, generates per-signer tokens,
 * and stores everything in Supabase. Does NOT send emails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest, supabaseStorageUpload } from '@/lib/supabase';
import crypto from 'crypto';

interface SignerInput {
  name: string;
  email: string;
  role: string;
  sign_order: number;
  is_internal?: boolean;
}

interface CreateSignatureRequestBody {
  document_title: string;
  pdf_url: string;
  signers: SignerInput[];
  callback_url: string;
  metadata?: Record<string, unknown>;
  source_ref?: string;
}

interface SignatureRequest {
  id: string;
  status: string;
  document_title: string;
  pdf_url: string;
  pdf_storage_path: string;
  callback_url: string;
  source_ref: string | null;
  hash_chain: Array<{ version: string; sha256: string; timestamp: string }>;
  expires_at: string;
  created_at: string;
}

interface SignatureRequestSigner {
  id: string;
  request_id: string;
  name: string;
  email: string;
  role: string;
  sign_order: number;
  status: string;
}

function sha256(data: ArrayBuffer | string): string {
  if (typeof data === 'string') {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  return crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
}

export async function POST(req: NextRequest) {
  const authError = validateApiKey(req, 'SIGNATURE_API_KEY');
  if (authError) return authError;

  try {
    const body: CreateSignatureRequestBody = await req.json();

    // -------------------------------------------------------
    // Validation
    // -------------------------------------------------------
    if (!body.document_title?.trim()) {
      return NextResponse.json({ error: 'document_title is required' }, { status: 400 });
    }
    if (!body.pdf_url?.trim()) {
      return NextResponse.json({ error: 'pdf_url is required' }, { status: 400 });
    }
    if (!body.callback_url?.trim()) {
      return NextResponse.json({ error: 'callback_url is required' }, { status: 400 });
    }
    if (!Array.isArray(body.signers) || body.signers.length === 0) {
      return NextResponse.json({ error: 'At least one signer is required' }, { status: 400 });
    }

    for (let i = 0; i < body.signers.length; i++) {
      const s = body.signers[i];
      if (!s.name?.trim() || !s.email?.trim() || !s.role?.trim()) {
        return NextResponse.json(
          { error: `Signer ${i}: name, email, and role are required` },
          { status: 400 },
        );
      }
      if (typeof s.sign_order !== 'number' || s.sign_order < 1) {
        return NextResponse.json(
          { error: `Signer ${i}: sign_order must be a positive integer` },
          { status: 400 },
        );
      }
    }

    // -------------------------------------------------------
    // Download PDF from provided URL
    // -------------------------------------------------------
    let pdfBuffer: ArrayBuffer;
    try {
      const pdfRes = await fetch(body.pdf_url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!pdfRes.ok) {
        return NextResponse.json(
          { error: `Failed to download PDF: HTTP ${pdfRes.status}` },
          { status: 422 },
        );
      }
      pdfBuffer = await pdfRes.arrayBuffer();
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to download PDF: ${err instanceof Error ? err.message : 'Unknown error'}` },
        { status: 422 },
      );
    }

    if (pdfBuffer.byteLength < 100) {
      return NextResponse.json({ error: 'Downloaded PDF is too small to be valid' }, { status: 422 });
    }

    // -------------------------------------------------------
    // Compute SHA-256 of the original PDF
    // -------------------------------------------------------
    const pdfHash = sha256(pdfBuffer);
    const now = new Date().toISOString();

    const hashChain = [
      { version: 'unsigned', sha256: pdfHash, timestamp: now },
    ];

    // -------------------------------------------------------
    // Store PDF in Supabase Storage
    // -------------------------------------------------------
    const storagePath = `requests/${crypto.randomUUID()}/${body.document_title.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;

    await supabaseStorageUpload(
      'signed-agreements',
      storagePath,
      new Uint8Array(pdfBuffer),
      'application/pdf',
    );

    // -------------------------------------------------------
    // Hash the API key used for audit trail
    // -------------------------------------------------------
    const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('authorization')?.slice(7) || '';
    const apiKeyHash = sha256(apiKeyHeader);

    // -------------------------------------------------------
    // Create signature_request record
    // -------------------------------------------------------
    const [request] = await supabaseRest<SignatureRequest[]>('signature_requests', {
      method: 'POST',
      body: JSON.stringify({
        source_system: 'crm',
        source_ref: body.source_ref || null,
        status: 'pending',
        document_title: body.document_title.trim(),
        pdf_url: body.pdf_url,
        pdf_storage_path: storagePath,
        callback_url: body.callback_url.trim(),
        api_key_hash: apiKeyHash,
        metadata: body.metadata || null,
        hash_chain: hashChain,
      }),
      prefer: 'return=representation',
    });

    // -------------------------------------------------------
    // Create signer records with unique tokens
    // -------------------------------------------------------
    const signerTokenMap: Array<{ signer: SignerInput; rawToken: string; tokenHash: string }> = [];

    for (const signer of body.signers) {
      const rawToken = crypto.randomUUID();
      const tokenHash = sha256(rawToken);
      signerTokenMap.push({ signer, rawToken, tokenHash });
    }

    const signerRecords = signerTokenMap.map(({ signer, tokenHash }) => ({
      request_id: request.id,
      name: signer.name.trim(),
      email: signer.email.trim().toLowerCase(),
      role: signer.role.trim(),
      sign_order: signer.sign_order,
      is_internal: signer.is_internal ?? false,
      token_hash: tokenHash,
      status: 'pending',
    }));

    const createdSigners = await supabaseRest<SignatureRequestSigner[]>(
      'signature_request_signers',
      {
        method: 'POST',
        body: JSON.stringify(signerRecords),
        prefer: 'return=representation',
      },
    );

    // -------------------------------------------------------
    // Log audit event: request_created
    // -------------------------------------------------------
    await supabaseRest('signature_request_audit', {
      method: 'POST',
      body: JSON.stringify({
        request_id: request.id,
        event_type: 'request_created',
        actor_type: 'system',
        actor_email: null,
        document_hash: pdfHash,
        metadata: {
          source_system: 'crm',
          source_ref: body.source_ref || null,
          signer_count: body.signers.length,
          document_title: body.document_title,
          pdf_size_bytes: pdfBuffer.byteLength,
        },
      }),
      prefer: 'return=minimal',
    });

    // -------------------------------------------------------
    // Build response — include raw tokens ONLY in this response
    // (they are not stored; only hashes are persisted)
    // -------------------------------------------------------
    const signersResponse = createdSigners.map((cs) => {
      const match = signerTokenMap.find((stm) => stm.tokenHash === (cs as unknown as { token_hash: string }).token_hash);
      return {
        id: cs.id,
        name: cs.name,
        email: cs.email,
        role: cs.role,
        sign_order: cs.sign_order,
        token: match?.rawToken,
      };
    });

    return NextResponse.json(
      {
        id: request.id,
        status: request.status,
        document_title: request.document_title,
        expires_at: request.expires_at,
        signers: signersResponse,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[signature-requests] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
