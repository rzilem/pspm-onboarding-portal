import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, supabaseStorageDownload, supabaseStorageUpload } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { validatePortalToken } from '@/lib/auth';
import { evaluateAutomations } from '@/lib/automation-engine';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Signature, Task, Document } from '@/lib/types';

const CONSENT_TEXT =
  'I agree to sign this document electronically. I understand that my electronic signature has the same legal effect as a handwritten signature under the ESIGN Act and UETA.';

interface SignRequestBody {
  signature_type: 'draw' | 'type';
  signature_data?: string;
  typed_name?: string;
  signer_name: string;
  signer_email?: string;
  signer_title?: string;
  signer_company?: string;
  initials?: string;
  initials_data?: string;
  consent_given: boolean;
}

/**
 * POST /api/portal/[token]/signatures/[sigId]/sign
 * Client signs a document electronically.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; sigId: string }> },
) {
  const { token, sigId } = await params;

  // Validate UUID format early — before any Supabase queries
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(sigId)) {
    return NextResponse.json({ error: 'Invalid signature ID format' }, { status: 400 });
  }

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  // Fetch the signature record and verify it belongs to this project
  let signature: Signature;
  try {
    const signatures = await supabaseRest<Signature[]>(
      `onboarding_signatures?id=eq.${sigId}&project_id=eq.${project.id}&select=*&limit=1`,
    );

    if (!signatures.length) {
      return NextResponse.json(
        { error: 'Signature not found or does not belong to this project' },
        { status: 404 },
      );
    }
    signature = signatures[0];
  } catch (err) {
    console.error('[portal/sign] Failed to fetch signature:', err);
    return NextResponse.json({ error: 'Failed to fetch signature' }, { status: 500 });
  }

  // Verify signature is in a signable state
  const signableStatuses: string[] = ['pending', 'sent', 'viewed'];
  if (!signableStatuses.includes(signature.status)) {
    return NextResponse.json(
      { error: `Signature has already been ${signature.status}` },
      { status: 400 },
    );
  }

  // Parse request body
  let body: SignRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  if (!body.signer_name || typeof body.signer_name !== 'string') {
    return NextResponse.json({ error: 'signer_name is required' }, { status: 400 });
  }

  if (!body.signature_type || !['draw', 'type'].includes(body.signature_type)) {
    return NextResponse.json(
      { error: 'signature_type must be "draw" or "type"' },
      { status: 400 },
    );
  }

  if (body.signature_type === 'draw' && !body.signature_data) {
    return NextResponse.json(
      { error: 'signature_data is required for draw signatures' },
      { status: 400 },
    );
  }

  if (body.signature_type === 'type' && !body.typed_name) {
    return NextResponse.json(
      { error: 'typed_name is required for typed signatures' },
      { status: 400 },
    );
  }

  if (!body.consent_given) {
    return NextResponse.json(
      { error: 'Consent must be given to sign electronically' },
      { status: 400 },
    );
  }

  // Validate input lengths and formats
  if (body.signer_name.length > 200) {
    return NextResponse.json({ error: 'signer_name is too long (max 200 characters)' }, { status: 400 });
  }

  if (body.signer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.signer_email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  if (body.typed_name && body.typed_name.length > 200) {
    return NextResponse.json({ error: 'typed_name is too long (max 200 characters)' }, { status: 400 });
  }

  if (body.signer_title && body.signer_title.length > 200) {
    return NextResponse.json({ error: 'signer_title is too long' }, { status: 400 });
  }

  if (body.signer_company && body.signer_company.length > 200) {
    return NextResponse.json({ error: 'signer_company is too long' }, { status: 400 });
  }

  if (body.initials && body.initials.length > 5) {
    return NextResponse.json({ error: 'initials is too long (max 5 characters)' }, { status: 400 });
  }

  // Limit base64 signature data to ~500KB
  const MAX_BASE64_SIZE = 500 * 1024;
  if (body.signature_data && body.signature_data.length > MAX_BASE64_SIZE) {
    return NextResponse.json({ error: 'signature_data exceeds maximum size' }, { status: 400 });
  }

  if (body.initials_data && body.initials_data.length > MAX_BASE64_SIZE) {
    return NextResponse.json({ error: 'initials_data exceeds maximum size' }, { status: 400 });
  }

  // Capture metadata — validate IP format for INET column compatibility
  const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ipAddress = rawIp && IP_REGEX.test(rawIp) ? rawIp : null;
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const now = new Date().toISOString();

  try {
    // Update the signature record
    const signatureUpdate: Record<string, unknown> = {
      signature_type: body.signature_type,
      signer_name: body.signer_name,
      user_agent: userAgent,
      consent_text: CONSENT_TEXT,
      consent_given_at: now,
      status: 'signed',
      signed_at: now,
    };

    // Only set ip_address if we have a valid IP (column is INET type, rejects non-IP strings)
    if (ipAddress) {
      signatureUpdate.ip_address = ipAddress;
    }

    if (body.signature_type === 'draw') {
      signatureUpdate.signature_data = body.signature_data;
    } else {
      signatureUpdate.typed_name = body.typed_name;
    }

    if (body.signer_email) {
      signatureUpdate.signer_email = body.signer_email;
    }

    if (body.signer_title) {
      signatureUpdate.signer_title = body.signer_title;
    }

    if (body.signer_company) {
      signatureUpdate.signer_company = body.signer_company;
    }

    if (body.initials) {
      signatureUpdate.initials = body.initials;
    }

    if (body.initials_data) {
      signatureUpdate.initials_data = body.initials_data;
    }

    const results = await supabaseRest<Signature[]>(
      `onboarding_signatures?id=eq.${sigId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(signatureUpdate),
        prefer: 'return=representation',
      },
    );

    if (!results.length) {
      return NextResponse.json({ error: 'Signature update failed' }, { status: 500 });
    }
    const updatedSignature = results[0];

    // Generate signed PDF if signature has a document
    if (signature.document_id) {
      try {
        await generateSignedPdf(
          signature.document_id,
          sigId,
          body.signature_type,
          body.signature_data,
          body.typed_name,
          body.signer_name,
          now,
          ipAddress ?? undefined,
        );
      } catch (pdfErr) {
        // Non-fatal — signature was recorded, PDF generation is enhancement
        console.error('[portal/sign] Failed to generate signed PDF:', pdfErr);
      }
    }

    // Insert audit record (non-fatal — signature is already recorded)
    try {
      await supabaseRest(
        'onboarding_signature_audit',
        {
          method: 'POST',
          body: JSON.stringify({
            signature_id: sigId,
            event_type: 'signed',
            event_data: {
              signer_name: body.signer_name,
              signer_email: body.signer_email || null,
              signer_title: body.signer_title || null,
              signer_company: body.signer_company || null,
              initials: body.initials || null,
              signature_type: body.signature_type,
              ip_address: ipAddress,
              user_agent: userAgent,
            },
            ip_address: ipAddress ?? undefined,
            user_agent: userAgent,
          }),
          prefer: 'return=minimal',
        },
      );
    } catch (auditErr) {
      // Non-fatal — signature was recorded, audit is secondary
      console.error('[portal/sign] Failed to insert audit record:', auditErr);
    }

    // If linked to a task, mark that task as completed
    if (signature.task_id) {
      try {
        const tasks = await supabaseRest<Task[]>(
          `onboarding_tasks?id=eq.${signature.task_id}&project_id=eq.${project.id}&select=id,status&limit=1`,
        );

        if (tasks.length && tasks[0].status !== 'completed') {
          await supabaseRest(
            `onboarding_tasks?id=eq.${signature.task_id}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'completed',
                completed_at: now,
                completed_by: 'client',
                updated_at: now,
              }),
              prefer: 'return=minimal',
            },
          );

          logActivity({
            project_id: project.id,
            task_id: signature.task_id,
            actor: body.signer_name,
            actor_type: 'client',
            action: 'task_completed',
            details: { reason: 'document_signed', signature_id: sigId },
          });
        }
      } catch (err) {
        // Non-fatal — signature was recorded, task update is secondary
        console.error('[portal/sign] Failed to update linked task:', err);
      }
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: project.id,
      task_id: signature.task_id || undefined,
      actor: body.signer_name,
      actor_type: 'client',
      action: 'document_signed',
      details: {
        signature_id: sigId,
        signature_type: body.signature_type,
        document_id: signature.document_id,
      },
    });

    // Trigger automations on signature (fire-and-forget)
    evaluateAutomations(project.id, { type: 'signature_signed', signature_id: sigId }).catch(console.error);

    return NextResponse.json(updatedSignature);
  } catch (err) {
    console.error('[portal/sign] Failed to process signature:', err);
    return NextResponse.json({ error: 'Failed to process signature' }, { status: 500 });
  }
}

/**
 * Generate a signed PDF with embedded signature
 */
async function generateSignedPdf(
  documentId: string,
  signatureId: string,
  signatureType: 'draw' | 'type',
  signatureData?: string,
  typedName?: string,
  signerName?: string,
  signedAt?: string,
  ipAddress?: string,
): Promise<void> {
  // Fetch document record
  const documents = await supabaseRest<Document[]>(
    `onboarding_documents?id=eq.${documentId}&select=*&limit=1`,
  );

  if (!documents.length || !documents[0].template_url) {
    console.warn('[generateSignedPdf] No document or template_url found');
    return;
  }

  const document = documents[0];
  const templateUrl = document.template_url!; // narrowed by guard above

  // Download original PDF from storage
  // template_url is stored as "bucket/path" (e.g. "onboarding-files/documents/uuid/file.pdf")
  // Split to extract bucket and path separately to avoid double-prefixing
  const [bucket, ...pathParts] = templateUrl.split('/');
  const filePath = pathParts.join('/');
  const pdfBytes = await supabaseStorageDownload(bucket, filePath);

  // Load PDF with pdf-lib
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width, height } = lastPage.getSize();

  // Embed signature
  if (signatureType === 'draw' && signatureData) {
    // Decode base64 PNG and embed as image
    const base64Data = signatureData.split(',')[1] || signatureData;
    const pngBytes = Buffer.from(base64Data, 'base64');
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const pngDims = pngImage.scale(0.3); // Scale to 30% of original size
    const xPos = 50;
    const yPos = 120;

    lastPage.drawImage(pngImage, {
      x: xPos,
      y: yPos,
      width: pngDims.width,
      height: pngDims.height,
    });
  } else if (signatureType === 'type' && typedName) {
    // Draw typed name in a cursive-like font (using Helvetica as fallback)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    lastPage.drawText(typedName, {
      x: 50,
      y: 130,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
  }

  // Add annotation text below signature
  const annotFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const signedDate = signedAt ? new Date(signedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }) : new Date().toLocaleString();

  const titleLine = signerName || 'Unknown';
  const annotationText = `Electronically signed by ${titleLine} on ${signedDate} | IP: ${ipAddress || 'unknown'}`;

  lastPage.drawText(annotationText, {
    x: 50,
    y: 100,
    size: 8,
    font: annotFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Save the modified PDF
  const signedPdfBytes = await pdfDoc.save();

  // Upload signed PDF to storage
  // Path within the bucket (NOT prefixed with bucket name)
  const storagePath = `signed/${signatureId}.pdf`;
  await supabaseStorageUpload(
    'onboarding-files',
    storagePath,
    signedPdfBytes,
    'application/pdf',
  );

  // Store as bucket/path so the download endpoint can split on first '/'
  const signedPdfPath = `onboarding-files/${storagePath}`;
  await supabaseRest(
    `onboarding_signatures?id=eq.${signatureId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ signed_pdf_path: signedPdfPath }),
      prefer: 'return=minimal',
    },
  );

  console.log(`[generateSignedPdf] Signed PDF generated: ${signedPdfPath}`);
}
