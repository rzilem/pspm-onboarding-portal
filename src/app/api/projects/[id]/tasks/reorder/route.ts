import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';

/**
 * PATCH /api/projects/[id]/tasks/reorder — Bulk update task order
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();

    const { tasks } = body;

    if (!Array.isArray(tasks)) {
      return NextResponse.json({ error: 'tasks must be an array' }, { status: 400 });
    }

    // Update each task's order_index
    for (const task of tasks) {
      if (!task.id || typeof task.order_index !== 'number') {
        continue;
      }

      await supabaseRest(
        `onboarding_tasks?id=eq.${encodeURIComponent(task.id)}&project_id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ order_index: task.order_index }),
        },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/projects/[id]/tasks/reorder] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
