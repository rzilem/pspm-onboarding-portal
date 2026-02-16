import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Stage } from '@/lib/types';

/**
 * PATCH /api/templates/[id]/stages/[stageId] — Update stage
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { stageId } = await params;
    const body = await req.json();

    const allowed: Record<string, unknown> = {};
    if ('name' in body) allowed.name = body.name;
    if ('description' in body) allowed.description = body.description;
    if ('order_index' in body) allowed.order_index = body.order_index;
    if ('status' in body) allowed.status = body.status;

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await supabaseRest<Stage[]>(
      `onboarding_stages?id=eq.${encodeURIComponent(stageId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(allowed),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/templates/[id]/stages/[stageId]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/templates/[id]/stages/[stageId] — Delete stage
 * Sets all tasks' stage_id to null first
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { stageId } = await params;

    // Clear stage_id from all tasks in this stage
    await supabaseRest(
      `onboarding_template_tasks?stage_id=eq.${encodeURIComponent(stageId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ stage_id: null }),
      },
    );

    // Delete the stage
    await supabaseRest(
      `onboarding_stages?id=eq.${encodeURIComponent(stageId)}`,
      { method: 'DELETE' },
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[api/templates/[id]/stages/[stageId]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
