import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Template, TemplateTask } from '@/lib/types';

/**
 * GET /api/templates/[id] — Fetch a template with its tasks
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    // Two queries: template + its tasks (Supabase REST embedded select
    // requires foreign key relationships; do separate queries for reliability)
    const [templates, tasks] = await Promise.all([
      supabaseRest<Template[]>(
        `onboarding_templates?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      ),
      supabaseRest<TemplateTask[]>(
        `onboarding_template_tasks?template_id=eq.${encodeURIComponent(id)}&select=*&order=order_index`,
      ),
    ]);

    if (!templates.length) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...templates[0],
      tasks,
    });
  } catch (err) {
    console.error('[api/templates/[id]] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/templates/[id] — Update template fields
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

    // Only allow updating specific fields
    const allowed: Record<string, unknown> = {};
    if ('name' in body) allowed.name = body.name;
    if ('description' in body) allowed.description = body.description;
    if ('is_active' in body) allowed.is_active = body.is_active;
    if ('estimated_days' in body) allowed.estimated_days = body.estimated_days;

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Allowed: name, description, is_active, estimated_days' },
        { status: 400 },
      );
    }

    const updated = await supabaseRest<Template[]>(
      `onboarding_templates?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(allowed),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/templates/[id]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
