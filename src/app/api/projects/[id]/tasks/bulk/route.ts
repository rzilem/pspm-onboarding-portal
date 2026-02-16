import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Task } from '@/lib/types';

/**
 * POST /api/projects/[id]/tasks/bulk — Bulk operations on tasks
 * Supported actions: 'complete', 'delete'
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

    const { task_ids, action } = body;

    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return NextResponse.json({ error: 'task_ids must be a non-empty array' }, { status: 400 });
    }

    if (!['complete', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'action must be "complete" or "delete"' }, { status: 400 });
    }

    if (action === 'complete') {
      // Bulk mark tasks as completed
      const completedAt = new Date().toISOString();

      for (const taskId of task_ids) {
        await supabaseRest(
          `onboarding_tasks?id=eq.${encodeURIComponent(taskId)}&project_id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'completed',
              completed_at: completedAt,
            }),
          },
        );

        // Log activity (fire-and-forget)
        logActivity({
          project_id: id,
          task_id: taskId,
          actor: 'system',
          actor_type: 'staff',
          action: 'task_completed',
          details: { bulk_operation: true },
        });
      }

      return NextResponse.json({ success: true, completed: task_ids.length });
    }

    if (action === 'delete') {
      // Fetch task titles before deletion for activity log
      const tasks = await supabaseRest<Task[]>(
        `onboarding_tasks?id=in.(${task_ids.join(',')})&project_id=eq.${encodeURIComponent(id)}&select=id,title`,
      );

      // Bulk delete tasks
      for (const task of tasks) {
        await supabaseRest(
          `onboarding_tasks?id=eq.${encodeURIComponent(task.id)}&project_id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        );

        // Log activity (fire-and-forget)
        logActivity({
          project_id: id,
          task_id: task.id,
          actor: 'system',
          actor_type: 'staff',
          action: 'task_deleted',
          details: { title: task.title, bulk_operation: true },
        });
      }

      return NextResponse.json({ success: true, deleted: tasks.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[api/projects/[id]/tasks/bulk] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
