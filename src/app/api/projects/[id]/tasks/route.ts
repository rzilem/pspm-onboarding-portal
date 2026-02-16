import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Task } from '@/lib/types';

/**
 * GET /api/projects/[id]/tasks — List tasks for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const tasks = await supabaseRest<Task[]>(
      `onboarding_tasks?project_id=eq.${encodeURIComponent(id)}&order=order_index`,
    );

    return NextResponse.json(tasks);
  } catch (err) {
    console.error('[api/projects/[id]/tasks] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[id]/tasks — Create a new task for the project
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();

    const {
      title,
      description,
      order_index,
      visibility,
      assignee_type,
      assignee_email,
      category,
      requires_file_upload,
      requires_signature,
      depends_on,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const taskPayload = {
      project_id: id,
      title,
      description: description || null,
      order_index: order_index ?? 0,
      visibility: visibility || 'internal',
      assignee_type: assignee_type || 'staff',
      assignee_email: assignee_email || null,
      category: category || 'setup',
      requires_file_upload: requires_file_upload ?? false,
      requires_signature: requires_signature ?? false,
      depends_on: depends_on || null,
    };

    const [created] = await supabaseRest<Task[]>('onboarding_tasks', {
      method: 'POST',
      body: JSON.stringify(taskPayload),
      prefer: 'return=representation',
    });

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      task_id: created.id,
      actor: assignee_email || 'system',
      actor_type: assignee_email ? 'staff' : 'system',
      action: 'task_created',
      details: { title, category: taskPayload.category },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/projects/[id]/tasks] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
