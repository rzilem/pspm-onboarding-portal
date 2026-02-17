import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Comment } from '@/lib/types';

/**
 * GET /api/projects/[id]/tasks/[taskId]/comments — List comments (staff sees all including internal)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  const { id, taskId } = await params;

  try {
    const comments = await supabaseRest<Comment[]>(
      `onboarding_comments?project_id=eq.${encodeURIComponent(id)}&task_id=eq.${encodeURIComponent(taskId)}&order=created_at.asc`,
    );
    return NextResponse.json(comments);
  } catch (err) {
    console.error('[comments] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[id]/tasks/[taskId]/comments — Create a staff comment
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  const { id, taskId } = await params;

  try {
    const body = await req.json();

    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const comment = {
      project_id: id,
      task_id: taskId,
      author_email: body.author_email || 'staff@psprop.net',
      author_name: body.author_name || 'Staff',
      author_type: 'staff',
      content: body.content.trim(),
      is_internal: body.is_internal ?? false,
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
      project_id: id,
      task_id: taskId,
      actor: comment.author_email,
      actor_type: 'staff',
      action: comment.is_internal ? 'internal_comment_added' : 'comment_added',
      details: { content_preview: comment.content.slice(0, 100) },
    });

    return NextResponse.json(created[0], { status: 201 });
  } catch (err) {
    console.error('[comments] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
