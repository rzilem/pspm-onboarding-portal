import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Template, TemplateTask } from '@/lib/types';

/**
 * GET /api/templates — List all templates
 * Supports ?active_only=true
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    let path = 'onboarding_templates?select=*&order=created_at.desc';

    const activeOnly = req.nextUrl.searchParams.get('active_only');
    if (activeOnly === 'true') {
      path += '&is_active=eq.true';
    }

    const templates = await supabaseRest<Template[]>(path);

    return NextResponse.json(templates);
  } catch (err) {
    console.error('[api/templates] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/templates — Create a template with optional embedded tasks
 */
export async function POST(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const { name, description, estimated_days, tasks } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Create the template
    const templatePayload = {
      name,
      description: description || null,
      estimated_days: estimated_days || null,
    };

    const [created] = await supabaseRest<Template[]>('onboarding_templates', {
      method: 'POST',
      body: JSON.stringify(templatePayload),
      prefer: 'return=representation',
    });

    // Insert template tasks if provided
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      const taskInserts = tasks.map(
        (
          t: {
            title: string;
            description?: string;
            order_index: number;
            visibility?: string;
            assignee_type?: string;
            category?: string;
            requires_file_upload?: boolean;
            requires_signature?: boolean;
          },
          idx: number,
        ) => ({
          template_id: created.id,
          title: t.title,
          description: t.description || null,
          order_index: t.order_index ?? idx,
          visibility: t.visibility || 'internal',
          assignee_type: t.assignee_type || 'staff',
          category: t.category || 'setup',
          requires_file_upload: t.requires_file_upload ?? false,
          requires_signature: t.requires_signature ?? false,
        }),
      );

      const insertedTasks = await supabaseRest<TemplateTask[]>('onboarding_template_tasks', {
        method: 'POST',
        body: JSON.stringify(taskInserts),
        prefer: 'return=representation',
      });

      created.tasks = insertedTasks;
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/templates] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
