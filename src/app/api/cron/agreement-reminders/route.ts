import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  );
}

// POST /api/cron/agreement-reminders
// Called by Cloud Scheduler daily to send reminder emails
// Reminders at day 3, 7, and 12 after initial send
export async function POST(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date();

  // Find all in-progress signature requests
  const { data: requests } = await supabase
    .from('signature_requests')
    .select('*, signers:signature_request_signers(*)')
    .eq('status', 'in_progress')
    .gt('expires_at', now.toISOString());

  if (!requests || requests.length === 0) {
    return NextResponse.json({ reminders_sent: 0 });
  }

  let remindersSent = 0;

  for (const request of requests) {
    const signers = request.signers || [];
    const pendingSigners = signers.filter(
      (s: any) => ['notified', 'viewed'].includes(s.status)
    );

    for (const signer of pendingSigners) {
      if (!signer.notified_at) continue;

      const notifiedAt = new Date(signer.notified_at);
      const daysSinceNotified = Math.floor(
        (now.getTime() - notifiedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Send reminders at day 3, 7, 12
      const reminderDays = [3, 7, 12];
      if (!reminderDays.includes(daysSinceNotified)) continue;

      // Check if we already sent this reminder (via audit log)
      const { data: existingReminder } = await supabase
        .from('signature_request_audit')
        .select('id')
        .eq('request_id', request.id)
        .eq('signer_id', signer.id)
        .eq('event_type', `reminder_day_${daysSinceNotified}`)
        .maybeSingle();

      if (existingReminder) continue;

      // Get signed signers for social proof
      const signedSigners = signers
        .filter((s: any) => s.status === 'signed' && !s.is_internal)
        .map((s: any) => s.name);

      const expiresAt = new Date(request.expires_at);
      const daysUntilExpiry = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Build reminder email
      let reminderIntro = `Just a reminder — the management agreement for <b>${request.document_title}</b> is still awaiting your signature.`;

      if (daysSinceNotified >= 12) {
        reminderIntro += ` This link will expire in ${daysUntilExpiry} days.`;
      }

      if (signedSigners.length > 0) {
        reminderIntro += `<br><br>${signedSigners.join(' and ')} ${signedSigners.length === 1 ? 'has' : 'have'} already signed. The agreement is waiting for your signature to proceed.`;
      }

      // Send via Resend
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'PS Property Management <agreements@psprop.net>',
            to: signer.email,
            subject: `Reminder: Management agreement for ${request.document_title} awaiting your signature`,
            html: buildReminderEmail(signer.name, reminderIntro, request.document_title, signer.id),
          }),
        });
      }

      // Log audit
      await supabase.from('signature_request_audit').insert({
        request_id: request.id,
        signer_id: signer.id,
        event_type: `reminder_day_${daysSinceNotified}`,
        actor_type: 'system',
        metadata: {
          days_since_notified: daysSinceNotified,
          signed_signers: signedSigners,
        },
      });

      remindersSent++;
    }
  }

  return NextResponse.json({ reminders_sent: remindersSent });
}

function buildReminderEmail(
  name: string,
  intro: string,
  documentTitle: string,
  signerId: string
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="height:6px;background:#1B4F72;"></div>
  <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:32px;height:32px;background:#1B4F72;border-radius:6px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-size:11px;font-weight:700;">PS</span>
      </div>
      <span style="font-weight:600;font-size:14px;color:#111;">PS Property Management</span>
    </div>
  </div>
  <div style="padding:32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Hi ${name},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${intro}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/sign/${signerId}" style="display:inline-block;background:#3B6FB6;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">
        Review & Sign Agreement
      </a>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:13px;">Questions? Call us at 512-251-6122</p>
  </div>
  <div style="border-top:1px solid #e5e7eb;padding:24px 32px;text-align:center;">
    <p style="margin:0;color:#6b7280;font-size:12px;">PS Property Management</p>
    <p style="margin:4px 0 0;color:#6b7280;font-size:12px;font-style:italic;">Serving Central Texas since 1987</p>
    <p style="margin:4px 0 0;color:#6b7280;font-size:12px;">1490 Rusk Rd, Ste. 301, Round Rock, TX 78665 &middot; 512-251-6122</p>
  </div>
  <div style="height:4px;background:#1B4F72;"></div>
</div>
</body>
</html>`;
}
