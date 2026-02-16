import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { TemplateTask } from '@/lib/types';

/**
 * POST /api/templates/[id]/tasks — Create a template task
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

    // Build task payload
    const taskPayload = {
      template_id: templateId,
      title: body.title || 'Untitled Task',
      description: body.description || null,
      order_index: body.order_index ?? 0,
      visibility: body.visibility || 'internal',
      assignee_type: body.assignee_type || 'staff',
      category: body.category || 'setup',
      requires_file_upload: body.requires_file_upload ?? false,
      requires_signature: body.requires_signature ?? false,
      depends_on: body.depends_on || null,
      stage_id: body.stage_id || null,
      due_days_offset: body.due_days_offset || null,
    };

    const [created] = await supabaseRest<TemplateTask[]>('onboarding_template_tasks', {
      method: 'POST',
      body: JSON.stringify(taskPayload),
      prefer: 'return=representation',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/templates/[id]/tasks] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
