import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { TemplateTask } from '@/lib/types';

/**
 * PATCH /api/templates/[id]/tasks/[taskId] — Update template task
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { taskId } = await params;
    const body = await req.json();

    // Build update payload (allow all fields except id, template_id, created_at)
    const allowed: Record<string, unknown> = {};
    if ('title' in body) allowed.title = body.title;
    if ('description' in body) allowed.description = body.description;
    if ('order_index' in body) allowed.order_index = body.order_index;
    if ('visibility' in body) allowed.visibility = body.visibility;
    if ('assignee_type' in body) allowed.assignee_type = body.assignee_type;
    if ('category' in body) allowed.category = body.category;
    if ('requires_file_upload' in body) allowed.requires_file_upload = body.requires_file_upload;
    if ('requires_signature' in body) allowed.requires_signature = body.requires_signature;
    if ('depends_on' in body) allowed.depends_on = body.depends_on;
    if ('stage_id' in body) allowed.stage_id = body.stage_id;
    if ('due_days_offset' in body) allowed.due_days_offset = body.due_days_offset;

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await supabaseRest<TemplateTask[]>(
      `onboarding_template_tasks?id=eq.${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(allowed),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/templates/[id]/tasks/[taskId]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/templates/[id]/tasks/[taskId] — Delete template task
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { taskId } = await params;

    await supabaseRest(
      `onboarding_template_tasks?id=eq.${encodeURIComponent(taskId)}`,
      { method: 'DELETE' },
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[api/templates/[id]/tasks/[taskId]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
