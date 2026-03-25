/**
 * POST /api/signature-requests/[id]/send
 *
 * Sends signing invitation emails to the next eligible signer(s).
 * - Sends to the first pending signer by sign_order
 * - If multiple signers share the same sign_order (e.g., board members),
 *   all are notified in parallel
 * - Updates signer status to 'notified' and request status to 'in_progress'
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pspm-onboarding-portal-138752496729.us-central1.run.app';

interface SignatureRequest {
  id: string;
  status: string;
  document_title: string;
  metadata: Record<string, unknown> | null;
  expires_at: string;
}

interface Signer {
  id: string;
  request_id: string;
  name: string;
  email: string;
  role: string;
  sign_order: number;
  is_internal: boolean;
  token_hash: string;
  status: string;
  notified_at: string | null;
}

/**
 * Build the branded signing invitation email HTML.
 * Navy theme with PS branding per design spec.
 */
function buildSigningEmailHtml(params: {
  signerName: string;
  documentTitle: string;
  communityName: string | null;
  signingUrl: string;
  expiresAt: string;
}): string {
  const expiresDate = new Date(params.expiresAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const bodyText = params.communityName
    ? `The management agreement for <strong>${params.communityName}</strong> is ready for your review and signature.`
    : `The document <strong>${params.documentTitle}</strong> is ready for your review and signature.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Review &amp; Sign Agreement</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;">

          <!-- Navy top bar -->
          <tr>
            <td style="background:#1B4F72;height:6px;border-radius:8px 8px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Logo area -->
          <tr>
            <td style="background:#ffffff;padding:28px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin:0;font-size:20px;font-weight:700;color:#1B4F72;">PS Property Management</h1>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Signature Request</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="background:#ffffff;padding:16px 40px 0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background:#ffffff;padding:28px 40px 32px 40px;">
              <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1f2937;">
                Hi ${escapeHtml(params.signerName)},
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
                ${bodyText}
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#374151;">
                Please review the document carefully, then provide your electronic signature. The entire process takes just a few minutes.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:4px 0 28px;">
                    <a href="${escapeHtml(params.signingUrl)}"
                       style="display:inline-block;background:#3B6FB6;color:#ffffff;padding:14px 36px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;letter-spacing:0.02em;">
                      Review &amp; Sign Agreement
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#9ca3af;text-align:center;">
                This link expires on ${expiresDate}.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#9ca3af;text-align:center;">
                If the button above doesn't work, copy and paste this URL into your browser:<br>
                <a href="${escapeHtml(params.signingUrl)}" style="color:#3B6FB6;word-break:break-all;font-size:12px;">${escapeHtml(params.signingUrl)}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                PS Property Management &middot; 512-251-6122 &middot;
                <a href="mailto:info@psprop.net" style="color:#9ca3af;text-decoration:none;">info@psprop.net</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;line-height:1.5;color:#d1d5db;text-align:center;">
                This is an automated signature request. Please do not reply to this email.
              </p>
            </td>
          </tr>

          <!-- Navy bottom bar -->
          <tr>
            <td style="background:#1B4F72;height:6px;border-radius:0 0 8px 8px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      `signature_requests?id=eq.${encodeURIComponent(requestId)}&limit=1`,
    );

    if (!requests.length) {
      return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });
    }

    const request = requests[0];

    if (request.status === 'cancelled') {
      return NextResponse.json({ error: 'Signature request has been cancelled' }, { status: 409 });
    }
    if (request.status === 'completed') {
      return NextResponse.json({ error: 'Signature request is already completed' }, { status: 409 });
    }
    if (request.status === 'expired') {
      return NextResponse.json({ error: 'Signature request has expired' }, { status: 409 });
    }

    // Check expiry
    if (new Date(request.expires_at) < new Date()) {
      await supabaseRest(
        `signature_requests?id=eq.${encodeURIComponent(requestId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'expired' }),
          prefer: 'return=minimal',
        },
      );
      return NextResponse.json({ error: 'Signature request has expired' }, { status: 409 });
    }

    // -------------------------------------------------------
    // Fetch all signers for this request
    // -------------------------------------------------------
    const allSigners = await supabaseRest<Signer[]>(
      `signature_request_signers?request_id=eq.${encodeURIComponent(requestId)}&order=sign_order`,
    );

    if (!allSigners.length) {
      return NextResponse.json({ error: 'No signers found for this request' }, { status: 422 });
    }

    // -------------------------------------------------------
    // Find the next batch of pending signers to notify
    // -------------------------------------------------------
    const pendingSigners = allSigners.filter((s) => s.status === 'pending');

    if (pendingSigners.length === 0) {
      return NextResponse.json(
        { message: 'All signers have already been notified or have signed' },
        { status: 200 },
      );
    }

    // Get the lowest sign_order among pending signers
    const nextOrder = Math.min(...pendingSigners.map((s) => s.sign_order));
    const signersToNotify = pendingSigners.filter((s) => s.sign_order === nextOrder);

    // -------------------------------------------------------
    // The caller must provide signer tokens in the body
    // (since we don't store raw tokens, the CRM must pass them
    // from the create response). Alternatively, we can accept
    // a mapping of signer_id -> token.
    // -------------------------------------------------------
    let tokenMap: Record<string, string> = {};
    try {
      const body = await req.json();
      if (body.tokens && typeof body.tokens === 'object') {
        tokenMap = body.tokens;
      }
    } catch {
      // Body may be empty — that's OK if tokens were not provided
    }

    // -------------------------------------------------------
    // Send emails to each signer in this batch
    // -------------------------------------------------------
    const communityName = (request.metadata as Record<string, unknown> | null)?.community_name as string | null;
    const now = new Date().toISOString();
    const results: Array<{ signer_id: string; email: string; status: string }> = [];

    for (const signer of signersToNotify) {
      // Build signing URL from the token map or fall back
      const rawToken = tokenMap[signer.id];
      if (!rawToken) {
        results.push({
          signer_id: signer.id,
          email: signer.email,
          status: 'skipped_no_token',
        });
        continue;
      }

      const signingUrl = `${APP_URL}/sign/${rawToken}`;

      const html = buildSigningEmailHtml({
        signerName: signer.name,
        documentTitle: request.document_title,
        communityName,
        signingUrl,
        expiresAt: request.expires_at,
      });

      const emailResult = await sendEmail({
        to: signer.email,
        subject: `Signature Required - ${request.document_title}`,
        html,
        template_type: 'signature_request_external',
        recipient_name: signer.name,
      });

      if (emailResult) {
        // Update signer status to 'notified'
        await supabaseRest(
          `signature_request_signers?id=eq.${encodeURIComponent(signer.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'notified',
              notified_at: now,
            }),
            prefer: 'return=minimal',
          },
        );

        // Audit log
        await supabaseRest('signature_request_audit', {
          method: 'POST',
          body: JSON.stringify({
            request_id: requestId,
            signer_id: signer.id,
            event_type: 'email_sent',
            actor_type: 'system',
            actor_email: signer.email,
            metadata: {
              resend_id: emailResult.id,
              sign_order: signer.sign_order,
            },
          }),
          prefer: 'return=minimal',
        });

        results.push({ signer_id: signer.id, email: signer.email, status: 'notified' });
      } else {
        // Audit log for failed send
        await supabaseRest('signature_request_audit', {
          method: 'POST',
          body: JSON.stringify({
            request_id: requestId,
            signer_id: signer.id,
            event_type: 'email_failed',
            actor_type: 'system',
            actor_email: signer.email,
            metadata: { reason: 'Resend API returned null' },
          }),
          prefer: 'return=minimal',
        });

        results.push({ signer_id: signer.id, email: signer.email, status: 'email_failed' });
      }
    }

    // -------------------------------------------------------
    // Update request status to 'in_progress' if still pending
    // -------------------------------------------------------
    if (request.status === 'pending') {
      await supabaseRest(
        `signature_requests?id=eq.${encodeURIComponent(requestId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'in_progress' }),
          prefer: 'return=minimal',
        },
      );
    }

    // Audit: batch send
    await supabaseRest('signature_request_audit', {
      method: 'POST',
      body: JSON.stringify({
        request_id: requestId,
        event_type: 'emails_dispatched',
        actor_type: 'system',
        metadata: {
          sign_order: nextOrder,
          signers_notified: results.filter((r) => r.status === 'notified').length,
          signers_failed: results.filter((r) => r.status !== 'notified').length,
        },
      }),
      prefer: 'return=minimal',
    });

    return NextResponse.json({
      request_id: requestId,
      status: 'in_progress',
      signers_notified: results,
    });
  } catch (err) {
    console.error('[signature-requests/send] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
