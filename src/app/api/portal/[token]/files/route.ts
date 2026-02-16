import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest, supabaseStorageUpload } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { validatePortalToken } from '@/lib/auth';
import type { OnboardingFile } from '@/lib/types';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif',
]);

const EXTENSION_MIME_MAP: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
};

/**
 * GET /api/portal/[token]/files
 * List files for this project.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  try {
    const files = await supabaseRest<OnboardingFile[]>(
      `onboarding_files?project_id=eq.${project.id}&order=created_at.desc`,
    );

    return NextResponse.json(files);
  } catch (err) {
    console.error('[portal/files] Failed to list files:', err);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }
}

/**
 * POST /api/portal/[token]/files
 * Client uploads a file. Multipart form data with fields: file, task_id, description?
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const taskId = formData.get('task_id') as string | null;
  const description = formData.get('description') as string | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }

  // Validate file extension
  const fileName = file.name;
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: `File type ".${extension}" not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
      { status: 400 },
    );
  }

  // Validate MIME type matches extension
  const allowedMimes = EXTENSION_MIME_MAP[extension];
  if (allowedMimes && !allowedMimes.includes(file.type) && file.type !== 'application/octet-stream') {
    return NextResponse.json(
      { error: `File MIME type "${file.type}" does not match extension ".${extension}"` },
      { status: 400 },
    );
  }

  // If task_id provided, verify it belongs to this project
  if (taskId) {
    try {
      const tasks = await supabaseRest<Array<{ id: string }>>(
        `onboarding_tasks?id=eq.${taskId}&project_id=eq.${project.id}&select=id&limit=1`,
      );
      if (!tasks.length) {
        return NextResponse.json(
          { error: 'Task not found or does not belong to this project' },
          { status: 400 },
        );
      }
    } catch (err) {
      console.error('[portal/files] Failed to verify task:', err);
      return NextResponse.json({ error: 'Failed to verify task' }, { status: 500 });
    }
  }

  try {
    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const storagePath = `${project.id}/${Date.now()}_${fileName}`;
    const { path: fullPath } = await supabaseStorageUpload(
      'onboarding-files',
      storagePath,
      buffer,
      file.type || 'application/octet-stream',
    );

    // Insert file record
    const [fileRecord] = await supabaseRest<OnboardingFile[]>(
      'onboarding_files',
      {
        method: 'POST',
        body: JSON.stringify({
          project_id: project.id,
          task_id: taskId || null,
          file_name: fileName,
          file_type: file.type || null,
          file_size: file.size,
          storage_path: fullPath,
          uploaded_by: project.name,
          uploaded_by_type: 'client',
          category: null,
          description: description || null,
        }),
        prefer: 'return=representation',
      },
    );

    // Log activity (fire-and-forget)
    logActivity({
      project_id: project.id,
      task_id: taskId || undefined,
      actor: project.name,
      actor_type: 'client',
      action: 'file_uploaded',
      details: {
        file_name: fileName,
        file_size: file.size,
        file_type: file.type,
      },
    });

    return NextResponse.json(fileRecord, { status: 201 });
  } catch (err) {
    console.error('[portal/files] Failed to upload file:', err);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
