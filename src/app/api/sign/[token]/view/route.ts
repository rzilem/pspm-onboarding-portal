import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/sign/[token]/view — track that signer opened the link
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // Update signer status to viewed (only if currently pending or notified)
  const { data: signer } = await supabase
    .from('signature_request_signers')
    .select('id, request_id, status')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!signer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (['pending', 'notified'].includes(signer.status)) {
    await supabase
      .from('signature_request_signers')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', signer.id);
  }

  // Log audit event
  await supabase.from('signature_request_audit').insert({
    request_id: signer.request_id,
    signer_id: signer.id,
    event_type: 'viewed',
    actor_type: 'signer',
    actor_email: null,
    ip_address: ip,
    user_agent: userAgent,
  });

  return NextResponse.json({ ok: true });
}
