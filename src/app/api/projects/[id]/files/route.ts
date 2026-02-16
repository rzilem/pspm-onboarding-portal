import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest, supabaseStorageUpload } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { OnboardingFile } from '@/lib/types';

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * GET /api/projects/[id]/files — List files for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const files = await supabaseRest<OnboardingFile[]>(
      `onboarding_files?project_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc`,
    );

    return NextResponse.json(files);
  } catch (err) {
    console.error('[api/projects/[id]/files] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[id]/files — Upload a file for a project
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id: projectId } = await params;

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const taskId = formData.get('task_id') as string | null;
    const description = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File must be under 50MB' }, { status: 400 });
    }

    // Validate file extension
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !ALLOWED_EXTENSIONS.includes(fileExt)) {
      return NextResponse.json(
        { error: 'File type not allowed. Allowed: PDF, Office docs, images.' },
        { status: 400 },
      );
    }

    // Generate storage path
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `onboarding-files/${projectId}/${timestamp}_${sanitizedFileName}`;

    // Upload to Supabase Storage
    const fileBytes = await file.arrayBuffer();
    const storageUrl = await supabaseStorageUpload('onboarding-files', storagePath, fileBytes, file.type);

    // Get API key email for uploaded_by (if available)
    const apiKeyHeader = req.headers.get('x-api-key');
    const uploadedBy = apiKeyHeader ? 'staff' : 'staff';

    // Create file record in database
    const fileRecord = {
      project_id: projectId,
      task_id: taskId || null,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      uploaded_by_type: 'staff',
      uploaded_by: uploadedBy,
      description: description || null,
    };

    const [createdFile] = await supabaseRest<OnboardingFile[]>(
      'onboarding_files',
      {
        method: 'POST',
        body: JSON.stringify(fileRecord),
        prefer: 'return=representation',
      },
    );

    // Log activity
    logActivity({
      project_id: projectId,
      task_id: taskId || undefined,
      actor: uploadedBy,
      actor_type: 'staff',
      action: 'file_uploaded',
      details: {
        file_id: createdFile.id,
        file_name: file.name,
        file_size: file.size,
      },
    });

    return NextResponse.json(createdFile);
  } catch (err) {
    console.error('[api/projects/[id]/files] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
