import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { TemplateTask } from '@/lib/types';

/**
 * PATCH /api/templates/[id]/tasks/reorder — Bulk update order_index
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { tasks } = body;

    if (!Array.isArray(tasks)) {
      return NextResponse.json(
        { error: 'tasks must be an array of {id, order_index}' },
        { status: 400 },
      );
    }

    // Update each task's order_index individually (Supabase REST doesn't support batch updates easily)
    const updates = tasks.map(async (t: { id: string; order_index: number }) => {
      return supabaseRest<TemplateTask[]>(
        `onboarding_template_tasks?id=eq.${encodeURIComponent(t.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ order_index: t.order_index }),
          prefer: 'return=representation',
        },
      );
    });

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/templates/[id]/tasks/reorder] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
