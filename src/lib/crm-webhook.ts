/**
 * CRM Webhook — Fire-and-forget notifications to Propello AI CRM.
 * When key events happen in the onboarding portal, we notify the CRM
 * so it can update deal records and activity timelines.
 *
 * Env: CRM_WEBHOOK_URL (optional — if not set, webhooks are silently skipped)
 * Env: CRM_WEBHOOK_SECRET (optional — HMAC-SHA256 signature for verification)
 */

import crypto from 'crypto';

export interface CrmWebhookEvent {
  type:
    | 'project_created'
    | 'project_completed'
    | 'project_status_changed'
    | 'stage_completed'
    | 'task_completed'
    | 'signature_signed'
    | 'file_uploaded';
  project_id: string;
  source_deal_id: string | null;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Send a webhook event to the CRM.
 * Fire-and-forget: catches all errors, logs them, never throws.
 */
export async function notifyCrm(event: CrmWebhookEvent): Promise<void> {
  const webhookUrl = process.env.CRM_WEBHOOK_URL;
  if (!webhookUrl) return; // Silently skip if not configured

  // Skip if no deal linked
  if (!event.source_deal_id) return;

  try {
    const payload = JSON.stringify(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add HMAC signature if secret is configured
    const secret = process.env.CRM_WEBHOOK_SECRET;
    if (secret) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      headers['X-Webhook-Signature'] = signature;
    }

    // Retry up to 3 times with backoff for transient failures
    let lastErr = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) return; // Success

        lastErr = `POST ${webhookUrl} returned ${res.status}`;
        if (res.status < 500) break; // Don't retry 4xx
      } catch (err: any) {
        lastErr = err.message || String(err);
      }
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }
    console.error(`[crm-webhook] Failed after 3 attempts: ${lastErr}`);
  } catch (err) {
    console.error('[crm-webhook] Failed to notify CRM:', err);
  }
}
