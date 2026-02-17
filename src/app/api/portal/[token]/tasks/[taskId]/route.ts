import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { validatePortalToken } from '@/lib/auth';
import { evaluateAutomations } from '@/lib/automation-engine';
import { checkAndAdvanceStages } from '@/lib/stage-utils';
import type { Task } from '@/lib/types';

/**
 * PATCH /api/portal/[token]/tasks/[taskId]
 * Client marks an external task as completed or adds notes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; taskId: string }> },
) {
  const { token, taskId } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  // Verify the task belongs to this project and is external
  let task: Task;
  try {
    const tasks = await supabaseRest<Task[]>(
      `onboarding_tasks?id=eq.${taskId}&project_id=eq.${project.id}&visibility=eq.external&select=*&limit=1`,
    );

    if (!tasks.length) {
      return NextResponse.json(
        { error: 'Task not found or not accessible from portal' },
        { status: 404 },
      );
    }
    task = tasks[0];
  } catch (err) {
    console.error('[portal/tasks] Failed to fetch task:', err);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }

  // Parse request body
  let body: { status?: string; client_notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const activities: Array<{ action: string; details?: Record<string, unknown> }> = [];

  // Handle status change
  if (body.status !== undefined) {
    if (body.status !== 'completed') {
      return NextResponse.json(
        { error: 'Clients can only set status to "completed"' },
        { status: 400 },
      );
    }

    if (task.status !== 'pending' && task.status !== 'in_progress' && task.status !== 'waiting_client') {
      return NextResponse.json(
        { error: `Cannot mark task as completed from status "${task.status}"` },
        { status: 400 },
      );
    }

    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
    updates.completed_by = 'client';

    activities.push({
      action: 'task_completed',
      details: { task_title: task.title, previous_status: task.status },
    });
  }

  // Handle client notes
  if (body.client_notes !== undefined) {
    if (typeof body.client_notes !== 'string') {
      return NextResponse.json({ error: 'client_notes must be a string' }, { status: 400 });
    }
    updates.client_notes = body.client_notes;

    activities.push({
      action: 'task_notes_added',
      details: { task_title: task.title },
    });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No valid updates provided. Allowed: status, client_notes' },
      { status: 400 },
    );
  }

  updates.updated_at = new Date().toISOString();

  try {
    const updated = await supabaseRest<Task[]>(
      `onboarding_tasks?id=eq.${taskId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
        prefer: 'return=representation',
      },
    );

    // Log all activities (fire-and-forget)
    for (const activity of activities) {
      logActivity({
        project_id: project.id,
        task_id: taskId,
        actor: project.name,
        actor_type: 'client',
        action: activity.action,
        details: activity.details,
      });
    }

    // Trigger automations on task completion (fire-and-forget)
    if (body.status === 'completed') {
      evaluateAutomations(project.id, { type: 'task_completed', task_id: taskId }).catch(console.error);
      checkAndAdvanceStages(project.id, taskId).catch(console.error);
    }

    return NextResponse.json(updated[0] || updates);
  } catch (err) {
    console.error('[portal/tasks] Failed to update task:', err);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
