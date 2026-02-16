import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest, supabaseStorageDownload } from '@/lib/supabase';
import type { OnboardingFile } from '@/lib/types';

/**
 * GET /api/projects/[id]/files/[fileId]/download — Download a file
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id: projectId, fileId } = await params;

    // Fetch file record
    const files = await supabaseRest<OnboardingFile[]>(
      `onboarding_files?id=eq.${fileId}&project_id=eq.${projectId}&select=*&limit=1`,
    );

    if (!files.length) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const file = files[0];

    // Download from Supabase Storage
    const fileBlob = await supabaseStorageDownload('onboarding-files', file.storage_path);

    // Return file with appropriate headers
    const headers: Record<string, string> = {
      'Content-Type': file.file_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.file_name}"`,
    };

    if (file.file_size !== null) {
      headers['Content-Length'] = file.file_size.toString();
    }

    return new NextResponse(fileBlob, { headers });
  } catch (err) {
    console.error('[api/projects/[id]/files/[fileId]/download] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
