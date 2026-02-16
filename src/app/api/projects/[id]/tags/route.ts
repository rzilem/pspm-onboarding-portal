import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Tag } from '@/lib/types';

/**
 * GET /api/projects/[id]/tags — List tags for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const projectTags = await supabaseRest<Array<{ tag: Tag }>>(
      `onboarding_project_tags?project_id=eq.${encodeURIComponent(id)}&select=tag:onboarding_tags(id,name,color)`,
    );

    const tags = projectTags.map((pt) => pt.tag).filter(Boolean);
    return NextResponse.json(tags);
  } catch (err) {
    console.error('[api/projects/[id]/tags] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[id]/tags — Add a tag to a project
 * Body: { tag_id: string }
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

    if (!body.tag_id || typeof body.tag_id !== 'string') {
      return NextResponse.json({ error: 'tag_id is required' }, { status: 400 });
    }

    await supabaseRest('onboarding_project_tags', {
      method: 'POST',
      body: JSON.stringify({
        project_id: id,
        tag_id: body.tag_id,
      }),
      prefer: 'return=minimal',
    });

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      actor: 'system',
      actor_type: 'staff',
      action: 'tag_added',
      details: { tag_id: body.tag_id },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('[api/projects/[id]/tags] POST error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    // Handle duplicate key (tag already assigned)
    if (message.includes('duplicate') || message.includes('unique') || message.includes('409')) {
      return NextResponse.json({ error: 'Tag already assigned to this project' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]/tags — Remove a tag from a project
 * Query param: ?tag_id=xxx
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const tagId = req.nextUrl.searchParams.get('tag_id');

    if (!tagId) {
      return NextResponse.json({ error: 'tag_id query parameter is required' }, { status: 400 });
    }

    await supabaseRest(
      `onboarding_project_tags?project_id=eq.${encodeURIComponent(id)}&tag_id=eq.${encodeURIComponent(tagId)}`,
      {
        method: 'DELETE',
      },
    );

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      actor: 'system',
      actor_type: 'staff',
      action: 'tag_removed',
      details: { tag_id: tagId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/projects/[id]/tags] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
