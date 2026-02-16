import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Stage } from '@/lib/types';

/**
 * GET /api/projects/[id]/stages — List stages for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const stages = await supabaseRest<Stage[]>(
      `onboarding_stages?project_id=eq.${encodeURIComponent(id)}&order=order_index`,
    );

    return NextResponse.json(stages);
  } catch (err) {
    console.error('[api/projects/[id]/stages] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[id]/stages — Create a stage for the project
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

    const { name, description, order_index } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const stagePayload = {
      project_id: id,
      name,
      description: description || null,
      order_index: order_index ?? 0,
      status: 'pending',
    };

    const [created] = await supabaseRest<Stage[]>('onboarding_stages', {
      method: 'POST',
      body: JSON.stringify(stagePayload),
      prefer: 'return=representation',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/projects/[id]/stages] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
