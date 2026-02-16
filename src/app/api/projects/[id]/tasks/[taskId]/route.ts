import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Task } from '@/lib/types';

/**
 * PATCH /api/projects/[id]/tasks/[taskId] — Update a task
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id, taskId } = await params;
    const body = await req.json();

    // Auto-set completed_at and completed_by on status transition to 'completed'
    let action = 'task_updated';
    if (body.status === 'completed') {
      body.completed_at = new Date().toISOString();
      if (!body.completed_by) {
        body.completed_by = body.assignee_email || req.headers.get('x-user-email') || 'system';
      }
      action = 'task_completed';
    }

    const updated = await supabaseRest<Task[]>(
      `onboarding_tasks?id=eq.${encodeURIComponent(taskId)}&project_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      task_id: taskId,
      actor: body.completed_by || body.assignee_email || 'system',
      actor_type: 'staff',
      action,
      details: {
        updated_fields: Object.keys(body),
        title: updated[0].title,
        status: body.status || undefined,
      },
    });

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/projects/[id]/tasks/[taskId]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[id]/tasks/[taskId] — Delete a task
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id, taskId } = await params;

    // Fetch task title before deletion for activity log
    const [existing] = await supabaseRest<Task[]>(
      `onboarding_tasks?id=eq.${encodeURIComponent(taskId)}&project_id=eq.${encodeURIComponent(id)}&select=id,title&limit=1`,
    );

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await supabaseRest(
      `onboarding_tasks?id=eq.${encodeURIComponent(taskId)}&project_id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      task_id: taskId,
      actor: 'system',
      actor_type: 'staff',
      action: 'task_deleted',
      details: { title: existing.title },
    });

    return NextResponse.json({ success: true, id: taskId });
  } catch (err) {
    console.error('[api/projects/[id]/tasks/[taskId]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
