import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';
import { validatePortalToken } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import type { Comment, Task } from '@/lib/types';

/**
 * GET /api/portal/[token]/tasks/[taskId]/comments — List non-internal comments
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; taskId: string }> },
) {
  const { token, taskId } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  try {
    // Verify task belongs to this project and is external
    const tasks = await supabaseRest<Task[]>(
      `onboarding_tasks?id=eq.${encodeURIComponent(taskId)}&project_id=eq.${project.id}&visibility=eq.external&select=id&limit=1`,
    );
    if (!tasks.length) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const comments = await supabaseRest<Comment[]>(
      `onboarding_comments?project_id=eq.${project.id}&task_id=eq.${encodeURIComponent(taskId)}&is_internal=eq.false&order=created_at.asc`,
    );
    return NextResponse.json(comments);
  } catch (err) {
    console.error('[portal/comments] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/portal/[token]/tasks/[taskId]/comments — Create a client comment
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; taskId: string }> },
) {
  const { token, taskId } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  try {
    // Verify task belongs to this project and is external
    const tasks = await supabaseRest<Task[]>(
      `onboarding_tasks?id=eq.${encodeURIComponent(taskId)}&project_id=eq.${project.id}&visibility=eq.external&select=id&limit=1`,
    );
    if (!tasks.length) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const body = await req.json();

    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const comment = {
      project_id: project.id,
      task_id: taskId,
      author_email: body.author_email || 'client',
      author_name: body.author_name || 'Client',
      author_type: 'client',
      content: body.content.trim(),
      is_internal: false,
    };

    const created = await supabaseRest<Comment[]>(
      'onboarding_comments',
      {
        method: 'POST',
        body: JSON.stringify(comment),
        prefer: 'return=representation',
      },
    );

    // Log activity (fire-and-forget)
    logActivity({
      project_id: project.id,
      task_id: taskId,
      actor: comment.author_name,
      actor_type: 'client',
      action: 'comment_added',
      details: { content_preview: comment.content.slice(0, 100) },
    });

    return NextResponse.json(created[0], { status: 201 });
  } catch (err) {
    console.error('[portal/comments] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
