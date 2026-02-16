import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Stage } from '@/lib/types';

/**
 * GET /api/templates/[id]/stages — List stages for template
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id: templateId } = await params;

    const stages = await supabaseRest<Stage[]>(
      `onboarding_stages?template_id=eq.${encodeURIComponent(templateId)}&select=*&order=order_index`,
    );

    return NextResponse.json(stages);
  } catch (err) {
    console.error('[api/templates/[id]/stages] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/templates/[id]/stages — Create a stage
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id: templateId } = await params;
    const body = await req.json();

    // Verify template exists
    const templates = await supabaseRest<Array<{ id: string }>>(
      `onboarding_templates?id=eq.${encodeURIComponent(templateId)}&select=id&limit=1`,
    );

    if (!templates.length) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const stagePayload = {
      template_id: templateId,
      name: body.name || 'Untitled Stage',
      description: body.description || null,
      order_index: body.order_index ?? 0,
      status: 'pending' as const,
    };

    const [created] = await supabaseRest<Stage[]>('onboarding_stages', {
      method: 'POST',
      body: JSON.stringify(stagePayload),
      prefer: 'return=representation',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/templates/[id]/stages] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
