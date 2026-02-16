import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Stage } from '@/lib/types';

/**
 * PATCH /api/projects/[id]/stages/[stageId] — Update a stage
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id, stageId } = await params;
    const body = await req.json();

    const updated = await supabaseRest<Stage[]>(
      `onboarding_stages?id=eq.${encodeURIComponent(stageId)}&project_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/projects/[id]/stages/[stageId]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[id]/stages/[stageId] — Delete a stage
 * First nullifies stage_id on all tasks in the stage
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id, stageId } = await params;

    // Nullify stage_id on all tasks in this stage
    await supabaseRest(
      `onboarding_tasks?stage_id=eq.${encodeURIComponent(stageId)}&project_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ stage_id: null }),
      },
    );

    // Delete the stage
    await supabaseRest(
      `onboarding_stages?id=eq.${encodeURIComponent(stageId)}&project_id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );

    return NextResponse.json({ success: true, id: stageId });
  } catch (err) {
    console.error('[api/projects/[id]/stages/[stageId]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
