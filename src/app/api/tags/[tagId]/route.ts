import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Tag } from '@/lib/types';

/**
 * PATCH /api/tags/[tagId] — Update tag name and/or color
 * Body: { name?: string, color?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { tagId } = await params;
    const body = await req.json();

    const updates: Record<string, string> = {};
    if (body.name && typeof body.name === 'string') {
      updates.name = body.name.trim();
    }
    if (body.color && typeof body.color === 'string') {
      updates.color = body.color;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await supabaseRest<Tag[]>(
      `onboarding_tags?id=eq.${encodeURIComponent(tagId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/tags/[tagId]] PATCH error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('duplicate') || message.includes('unique')) {
      return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/tags/[tagId] — Delete a tag (CASCADE removes project_tags)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { tagId } = await params;

    // Delete tag — CASCADE will handle onboarding_project_tags
    await supabaseRest(
      `onboarding_tags?id=eq.${encodeURIComponent(tagId)}`,
      {
        method: 'DELETE',
      },
    );

    return NextResponse.json({ success: true, id: tagId });
  } catch (err) {
    console.error('[api/tags/[tagId]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
