import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, supabaseStorageDownload } from '@/lib/supabase';
import { validatePortalToken } from '@/lib/auth';
import type { Signature, Document } from '@/lib/types';

/**
 * GET /api/portal/[token]/signatures/[sigId]/document
 * Download the document associated with a signature (PDF).
 * Returns the signed PDF if available, otherwise the original template.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; sigId: string }> },
) {
  const { token, sigId } = await params;

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
    console.error('[portal/document] Failed to fetch signature:', err);
    return NextResponse.json({ error: 'Failed to fetch signature' }, { status: 500 });
  }

  // If a signed PDF exists, serve that
  if (signature.signed_pdf_path) {
    try {
      const [bucket, ...pathParts] = signature.signed_pdf_path.split('/');
      const filePath = pathParts.join('/');
      const data = await supabaseStorageDownload(bucket, filePath);

      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="signed_${sigId}.pdf"`,
          'Cache-Control': 'private, no-cache',
        },
      });
    } catch (err) {
      console.error('[portal/document] Failed to download signed PDF:', err);
      // Fall through to try original template
    }
  }

  // Otherwise, try the original document template
  if (!signature.document_id) {
    return NextResponse.json(
      { error: 'No document associated with this signature' },
      { status: 404 },
    );
  }

  let document: Document;
  try {
    const documents = await supabaseRest<Document[]>(
      `onboarding_documents?id=eq.${signature.document_id}&select=*&limit=1`,
    );

    if (!documents.length) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    document = documents[0];
  } catch (err) {
    console.error('[portal/document] Failed to fetch document record:', err);
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 });
  }

  if (!document.template_url) {
    return NextResponse.json(
      { error: 'No document file available' },
      { status: 404 },
    );
  }

  try {
    // template_url is a Supabase Storage path like "bucket/path/to/file.pdf"
    const [bucket, ...pathParts] = document.template_url.split('/');
    const filePath = pathParts.join('/');
    const data = await supabaseStorageDownload(bucket, filePath);

    // Derive a friendly filename from the document name
    const safeName = document.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName}.pdf"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[portal/document] Failed to download document:', err);
    return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
  }
}
