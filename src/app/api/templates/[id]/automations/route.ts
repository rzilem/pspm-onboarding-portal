import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Automation } from '@/lib/types';

/**
 * GET /api/templates/[id]/automations — List all automations for a template
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const automations = await supabaseRest<Automation[]>(
      `onboarding_automations?template_id=eq.${encodeURIComponent(id)}&select=*&order=order_index`,
    );

    return NextResponse.json(automations);
  } catch (err) {
    console.error('[api/templates/[id]/automations] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/templates/[id]/automations — Create a new automation
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

    const {
      name,
      trigger_type,
      trigger_config,
      action_type,
      action_config,
      delay_minutes,
    } = body;

    if (!name || !trigger_type || !action_type) {
      return NextResponse.json(
        { error: 'name, trigger_type, and action_type are required' },
        { status: 400 },
      );
    }

    const validTriggers = ['task_completed', 'stage_completed', 'project_created', 'file_uploaded', 'signature_signed'];
    if (!validTriggers.includes(trigger_type)) {
      return NextResponse.json(
        { error: `Invalid trigger_type. Must be one of: ${validTriggers.join(', ')}` },
        { status: 400 },
      );
    }

    const validActions = ['activate_task', 'complete_task', 'activate_stage', 'complete_stage', 'send_email', 'update_project_status'];
    if (!validActions.includes(action_type)) {
      return NextResponse.json(
        { error: `Invalid action_type. Must be one of: ${validActions.join(', ')}` },
        { status: 400 },
      );
    }

    // Get the next order_index
    const existing = await supabaseRest<Array<{ order_index: number }>>(
      `onboarding_automations?template_id=eq.${encodeURIComponent(id)}&select=order_index&order=order_index.desc&limit=1`,
    );
    const nextOrder = existing.length > 0 ? existing[0].order_index + 1 : 0;

    const [created] = await supabaseRest<Automation[]>(
      'onboarding_automations',
      {
        method: 'POST',
        body: JSON.stringify({
          template_id: id,
          name,
          trigger_type,
          trigger_config: trigger_config || {},
          action_type,
          action_config: action_config || {},
          delay_minutes: delay_minutes || 0,
          order_index: nextOrder,
        }),
        prefer: 'return=representation',
      },
    );

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/templates/[id]/automations] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
