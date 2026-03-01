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

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!res.ok) {
      console.error(`[crm-webhook] POST ${webhookUrl} returned ${res.status}`);
    }
  } catch (err) {
    console.error('[crm-webhook] Failed to notify CRM:', err);
    // Fire-and-forget — never throw
  }
}
