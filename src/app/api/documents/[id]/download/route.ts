import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest, supabaseStorageDownload } from '@/lib/supabase';
import type { Document } from '@/lib/types';

/**
 * GET /api/documents/[id]/download — Download document PDF
 * Returns the PDF file with Content-Disposition: attachment
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    // Get document record
    const [doc] = await supabaseRest<Document[]>(
      `onboarding_documents?id=eq.${id}&select=*`,
    );

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.template_url) {
      return NextResponse.json({ error: 'Document has no file attached' }, { status: 404 });
    }

    // Extract storage path (remove bucket prefix if present)
    const storagePath = doc.template_url.replace(/^onboarding-files\//, '');

    // Download from Supabase Storage
    const buffer = await supabaseStorageDownload('onboarding-files', storagePath);

    // Extract original filename from storage path
    const pathParts = storagePath.split('/');
    const originalFilename = pathParts[pathParts.length - 1] || 'document.pdf';

    console.log('[api/documents/[id]/download] Download:', {
      id: doc.id,
      name: doc.name,
      filename: originalFilename,
      size: buffer.byteLength,
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${originalFilename}"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error('[api/documents/[id]/download] Download error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
