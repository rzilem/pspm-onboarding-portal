/**
 * Email notification system for PSPM Onboarding Portal.
 * Uses Resend for transactional email delivery.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@psprop.net';
const FROM_NAME = 'PS Property Management';
const BASE_URL = process.env.NEXTAUTH_URL || 'https://pspm-onboarding-portal-138752496729.us-central1.run.app';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  project_id?: string;
  template_type: string;
  recipient_name?: string;
}

/**
 * Send an email via Resend API and log to onboarding_email_log.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string } | null> {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set, skipping email');
    return null;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    const data = await res.json();

    // Log to database (fire-and-forget)
    logEmail({
      project_id: params.project_id || null,
      template_type: params.template_type,
      recipient_email: params.to,
      recipient_name: params.recipient_name || null,
      subject: params.subject,
      resend_id: data.id || null,
      status: res.ok ? 'sent' : 'failed',
      error_message: !res.ok ? JSON.stringify(data) : null,
    }).catch(console.error);

    if (!res.ok) {
      console.error('[email] Resend API error:', data);
      return null;
    }

    return { id: data.id };
  } catch (err) {
    console.error('[email] Failed to send:', err);

    logEmail({
      project_id: params.project_id || null,
      template_type: params.template_type,
      recipient_email: params.to,
      recipient_name: params.recipient_name || null,
      subject: params.subject,
      resend_id: null,
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    }).catch(console.error);

    return null;
  }
}

async function logEmail(record: Record<string, unknown>) {
  const { supabaseRest } = await import('./supabase');
  await supabaseRest('onboarding_email_log', {
    method: 'POST',
    body: JSON.stringify(record),
    prefer: 'return=minimal',
  });
}

/**
 * Standard email template wrapper with PSPM branding
 */
function emailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:20px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <!-- Cyan header bar -->
    <div style="background:#00c9e3;padding:24px 32px;border-radius:8px 8px 0 0;">
      <h1 style="color:white;margin:0;font-size:20px;">PS Property Management</h1>
      <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Community Onboarding Portal</p>
    </div>
    <!-- Content area -->
    <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;background:white;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px;">
      PS Property Management · Serving Central Texas since 1987<br/>
      (512) 251-6122 · <a href="mailto:info@psprop.net" style="color:#9ca3af;text-decoration:none;">info@psprop.net</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Button component for emails
 */
function emailButton(text: string, href: string): string {
  return `
<a href="${href}" style="display:inline-block;background:#00c9e3;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
  ${text}
</a>`;
}

/**
 * 1. Client Invite Email
 */
export async function sendClientInvite(params: {
  to: string;
  clientName: string;
  projectName: string;
  communityName?: string;
  portalToken: string;
  project_id: string;
}): Promise<{ id: string } | null> {
  const portalUrl = `${BASE_URL}/p/${params.portalToken}`;

  const content = `
<h2 style="color:#111827;margin:0 0 16px;font-size:18px;">Welcome to Your Onboarding Portal</h2>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">Hi ${params.clientName},</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  Welcome to PS Property Management! We're excited to begin working with you${params.communityName ? ` on ${params.communityName}` : ''}.
</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  We've created a personalized onboarding portal to guide you through the setup process for <strong>${params.projectName}</strong>.
  Your portal contains all the tasks, documents, and information you'll need to get started.
</p>
<div style="text-align:center;margin:24px 0;">
  ${emailButton('Access Your Portal', portalUrl)}
</div>
<p style="color:#374151;margin:16px 0 0;line-height:1.6;font-size:14px;">
  You can access your portal at any time using this link. No password required — just bookmark this page for easy access.
</p>
<p style="color:#374151;margin:16px 0 0;line-height:1.6;font-size:14px;">
  If you have any questions, don't hesitate to reach out to your assigned staff member or call us at (512) 251-6122.
</p>
<p style="color:#374151;margin:24px 0 0;line-height:1.6;">
  Best regards,<br/>
  <strong>PS Property Management Team</strong>
</p>`;

  return sendEmail({
    to: params.to,
    subject: `Welcome to PS Property Management — ${params.projectName}`,
    html: emailTemplate(content),
    project_id: params.project_id,
    template_type: 'client_invite',
    recipient_name: params.clientName,
  });
}

/**
 * 2. Task Reminder Email
 */
export async function sendTaskReminder(params: {
  to: string;
  clientName: string;
  projectName: string;
  pendingTasks: Array<{ title: string; due_date?: string }>;
  portalToken: string;
  project_id: string;
}): Promise<{ id: string } | null> {
  const portalUrl = `${BASE_URL}/p/${params.portalToken}`;
  const taskCount = params.pendingTasks.length;

  const taskListHtml = params.pendingTasks.slice(0, 5).map(task => {
    const dueText = task.due_date ? ` — <span style="color:#d97706;">Due ${new Date(task.due_date).toLocaleDateString()}</span>` : '';
    return `<li style="margin:8px 0;color:#374151;">${task.title}${dueText}</li>`;
  }).join('');

  const content = `
<h2 style="color:#111827;margin:0 0 16px;font-size:18px;">You Have ${taskCount} Pending Task${taskCount === 1 ? '' : 's'}</h2>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">Hi ${params.clientName},</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  This is a friendly reminder that you have <strong>${taskCount} pending task${taskCount === 1 ? '' : 's'}</strong> for <strong>${params.projectName}</strong>.
</p>
<div style="background:#f9fafb;border-left:4px solid #00c9e3;padding:16px;margin:24px 0;">
  <h3 style="margin:0 0 12px;font-size:14px;color:#111827;">Pending Tasks:</h3>
  <ul style="margin:0;padding-left:20px;">
    ${taskListHtml}
    ${taskCount > 5 ? `<li style="color:#6b7280;margin:8px 0;">...and ${taskCount - 5} more</li>` : ''}
  </ul>
</div>
<div style="text-align:center;margin:24px 0;">
  ${emailButton('View All Tasks', portalUrl)}
</div>
<p style="color:#374151;margin:16px 0 0;line-height:1.6;font-size:14px;">
  Please complete these tasks at your earliest convenience to keep your onboarding on track.
</p>
<p style="color:#374151;margin:24px 0 0;line-height:1.6;">
  Best regards,<br/>
  <strong>PS Property Management Team</strong>
</p>`;

  return sendEmail({
    to: params.to,
    subject: `${taskCount} Pending Task${taskCount === 1 ? '' : 's'} — ${params.projectName}`,
    html: emailTemplate(content),
    project_id: params.project_id,
    template_type: 'task_reminder',
    recipient_name: params.clientName,
  });
}

/**
 * 3. Signature Request Email
 */
export async function sendSignatureRequest(params: {
  to: string;
  signerName: string;
  projectName: string;
  documentName?: string;
  portalToken: string;
  signatureId: string;
  project_id: string;
}): Promise<{ id: string } | null> {
  const signUrl = `${BASE_URL}/p/${params.portalToken}/sign/${params.signatureId}`;
  const docName = params.documentName || 'document';

  const content = `
<h2 style="color:#111827;margin:0 0 16px;font-size:18px;">Signature Required</h2>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">Hi ${params.signerName},</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  We need your signature on <strong>${docName}</strong> for <strong>${params.projectName}</strong>.
</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  This is a secure, ESIGN-compliant electronic signature request. You can review the document and sign it electronically
  using your mouse, trackpad, or by typing your name.
</p>
<div style="text-align:center;margin:24px 0;">
  ${emailButton('Review & Sign Document', signUrl)}
</div>
<p style="color:#374151;margin:16px 0 0;line-height:1.6;font-size:14px;">
  This signature request is valid and can be completed at your convenience. If you have any questions about this document,
  please contact us at (512) 251-6122.
</p>
<p style="color:#374151;margin:24px 0 0;line-height:1.6;">
  Best regards,<br/>
  <strong>PS Property Management Team</strong>
</p>`;

  return sendEmail({
    to: params.to,
    subject: `Signature Required — ${docName}`,
    html: emailTemplate(content),
    project_id: params.project_id,
    template_type: 'signature_request',
    recipient_name: params.signerName,
  });
}

/**
 * 4. File Request Email
 */
export async function sendFileRequest(params: {
  to: string;
  clientName: string;
  projectName: string;
  taskTitle: string;
  portalToken: string;
  taskId: string;
  project_id: string;
}): Promise<{ id: string } | null> {
  const taskUrl = `${BASE_URL}/p/${params.portalToken}?task=${params.taskId}`;

  const content = `
<h2 style="color:#111827;margin:0 0 16px;font-size:18px;">Document Upload Requested</h2>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">Hi ${params.clientName},</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  We need you to upload a document for <strong>${params.projectName}</strong>:
</p>
<div style="background:#f9fafb;border-left:4px solid #00c9e3;padding:16px;margin:24px 0;">
  <h3 style="margin:0;font-size:14px;color:#111827;">${params.taskTitle}</h3>
</div>
<div style="text-align:center;margin:24px 0;">
  ${emailButton('Upload Document', taskUrl)}
</div>
<p style="color:#374151;margin:16px 0 0;line-height:1.6;font-size:14px;">
  You can upload PDF, Word, Excel, or image files up to 50MB. If you have any questions about what documents are needed,
  please call us at (512) 251-6122.
</p>
<p style="color:#374151;margin:24px 0 0;line-height:1.6;">
  Best regards,<br/>
  <strong>PS Property Management Team</strong>
</p>`;

  return sendEmail({
    to: params.to,
    subject: `Document Upload Needed — ${params.taskTitle}`,
    html: emailTemplate(content),
    project_id: params.project_id,
    template_type: 'file_request',
    recipient_name: params.clientName,
  });
}

/**
 * 5. Project Completed Email
 */
export async function sendProjectCompleted(params: {
  to: string;
  clientName: string;
  projectName: string;
  communityName?: string;
  project_id: string;
}): Promise<{ id: string } | null> {
  const content = `
<h2 style="color:#111827;margin:0 0 16px;font-size:18px;">🎉 Onboarding Complete!</h2>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">Hi ${params.clientName},</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  Congratulations! Your onboarding for <strong>${params.projectName}</strong> is now complete.
</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  We're thrilled to officially welcome ${params.communityName ? `<strong>${params.communityName}</strong>` : 'you'} to the
  PS Property Management family. Our team is ready to provide exceptional service to your community.
</p>
<div style="background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
  <h3 style="color:#065f46;margin:0 0 8px;font-size:16px;">What's Next?</h3>
  <p style="color:#047857;margin:0;line-height:1.6;font-size:14px;">
    Your assigned property manager will reach out shortly to schedule your kickoff meeting
    and answer any questions you may have.
  </p>
</div>
<p style="color:#374151;margin:16px 0 0;line-height:1.6;font-size:14px;">
  If you need anything in the meantime, don't hesitate to contact us at (512) 251-6122 or
  <a href="mailto:info@psprop.net" style="color:#00c9e3;">info@psprop.net</a>.
</p>
<p style="color:#374151;margin:24px 0 0;line-height:1.6;">
  Thank you for choosing PS Property Management!<br/><br/>
  <strong>PS Property Management Team</strong>
</p>`;

  return sendEmail({
    to: params.to,
    subject: `🎉 Welcome to PS Property Management!`,
    html: emailTemplate(content),
    project_id: params.project_id,
    template_type: 'project_completed',
    recipient_name: params.clientName,
  });
}

/**
 * 6. Staff Notification Email
 */
export async function sendStaffNotification(params: {
  to: string;
  staffName?: string;
  projectName: string;
  action: string;
  details?: string;
  project_id: string;
}): Promise<{ id: string } | null> {
  const greeting = params.staffName ? `Hi ${params.staffName},` : 'Hi,';

  const content = `
<h2 style="color:#111827;margin:0 0 16px;font-size:18px;">Project Activity: ${params.projectName}</h2>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">${greeting}</p>
<p style="color:#374151;margin:0 0 16px;line-height:1.6;">
  <strong>${params.action}</strong>
</p>
${params.details ? `
<div style="background:#f9fafb;border-left:4px solid #00c9e3;padding:16px;margin:24px 0;">
  <p style="color:#374151;margin:0;line-height:1.6;font-size:14px;">${params.details}</p>
</div>` : ''}
<p style="color:#374151;margin:16px 0 0;line-height:1.6;font-size:14px;">
  <a href="${BASE_URL}/projects" style="color:#00c9e3;text-decoration:none;">View in Dashboard →</a>
</p>`;

  return sendEmail({
    to: params.to,
    subject: `[Onboarding] ${params.action} — ${params.projectName}`,
    html: emailTemplate(content),
    project_id: params.project_id,
    template_type: 'staff_notification',
    recipient_name: params.staffName,
  });
}
