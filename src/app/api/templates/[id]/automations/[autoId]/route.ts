import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Automation } from '@/lib/types';

/**
 * PATCH /api/templates/[id]/automations/[autoId] — Update an automation
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; autoId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id, autoId } = await params;
    const body = await req.json();

    // Only allow updating specific fields
    const allowed: Record<string, unknown> = {};
    if ('name' in body) allowed.name = body.name;
    if ('is_active' in body) allowed.is_active = body.is_active;
    if ('trigger_type' in body) allowed.trigger_type = body.trigger_type;
    if ('trigger_config' in body) allowed.trigger_config = body.trigger_config;
    if ('action_type' in body) allowed.action_type = body.action_type;
    if ('action_config' in body) allowed.action_config = body.action_config;
    if ('delay_minutes' in body) allowed.delay_minutes = body.delay_minutes;
    if ('order_index' in body) allowed.order_index = body.order_index;

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    // Validate trigger_type if provided
    if (allowed.trigger_type) {
      const validTriggers = ['task_completed', 'stage_completed', 'project_created', 'file_uploaded', 'signature_signed'];
      if (!validTriggers.includes(allowed.trigger_type as string)) {
        return NextResponse.json(
          { error: `Invalid trigger_type. Must be one of: ${validTriggers.join(', ')}` },
          { status: 400 },
        );
      }
    }

    // Validate action_type if provided
    if (allowed.action_type) {
      const validActions = ['activate_task', 'complete_task', 'activate_stage', 'complete_stage', 'send_email', 'update_project_status'];
      if (!validActions.includes(allowed.action_type as string)) {
        return NextResponse.json(
          { error: `Invalid action_type. Must be one of: ${validActions.join(', ')}` },
          { status: 400 },
        );
      }
    }

    allowed.updated_at = new Date().toISOString();

    const updated = await supabaseRest<Automation[]>(
      `onboarding_automations?id=eq.${encodeURIComponent(autoId)}&template_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(allowed),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/templates/[id]/automations/[autoId]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/templates/[id]/automations/[autoId] — Delete an automation
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; autoId: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id, autoId } = await params;

    // Verify the automation exists and belongs to this template
    const existing = await supabaseRest<Array<{ id: string }>>(
      `onboarding_automations?id=eq.${encodeURIComponent(autoId)}&template_id=eq.${encodeURIComponent(id)}&select=id&limit=1`,
    );

    if (!existing.length) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    await supabaseRest(
      `onboarding_automations?id=eq.${encodeURIComponent(autoId)}&template_id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );

    return NextResponse.json({ success: true, id: autoId });
  } catch (err) {
    console.error('[api/templates/[id]/automations/[autoId]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
