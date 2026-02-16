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
 * Supports ?duplicate=true&source_id=<id> to duplicate an existing template
 */
export async function POST(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const duplicate = req.nextUrl.searchParams.get('duplicate');
    const sourceId = req.nextUrl.searchParams.get('source_id');

    // Duplicate template flow
    if (duplicate === 'true' && sourceId) {
      // Fetch source template + tasks + stages
      const [sourceTemplates, sourceTasks, sourceStages] = await Promise.all([
        supabaseRest<Template[]>(
          `onboarding_templates?id=eq.${encodeURIComponent(sourceId)}&select=*&limit=1`,
        ),
        supabaseRest<TemplateTask[]>(
          `onboarding_template_tasks?template_id=eq.${encodeURIComponent(sourceId)}&select=*&order=order_index`,
        ),
        supabaseRest<Array<{ id: string; name: string; description: string | null; order_index: number }>>(
          `onboarding_stages?template_id=eq.${encodeURIComponent(sourceId)}&select=id,name,description,order_index&order=order_index`,
        ),
      ]);

      if (!sourceTemplates.length) {
        return NextResponse.json({ error: 'Source template not found' }, { status: 404 });
      }

      const source = sourceTemplates[0];

      // Create new template
      const templatePayload = {
        name: `${source.name} (Copy)`,
        description: source.description,
        estimated_days: source.estimated_days,
      };

      const [newTemplate] = await supabaseRest<Template[]>('onboarding_templates', {
        method: 'POST',
        body: JSON.stringify(templatePayload),
        prefer: 'return=representation',
      });

      // Copy stages and map old IDs to new IDs
      const stageIdMap = new Map<string, string>();
      if (sourceStages.length > 0) {
        const stageInserts = sourceStages.map((s) => ({
          template_id: newTemplate.id,
          name: s.name,
          description: s.description,
          order_index: s.order_index,
          status: 'pending' as const,
        }));

        const newStages = await supabaseRest<Array<{ id: string; order_index: number }>>(
          'onboarding_stages',
          {
            method: 'POST',
            body: JSON.stringify(stageInserts),
            prefer: 'return=representation',
          },
        );

        // Map old stage ID to new stage ID by order_index
        sourceStages.forEach((oldStage, idx) => {
          const newStage = newStages.find((ns) => ns.order_index === oldStage.order_index);
          if (newStage) stageIdMap.set(oldStage.id, newStage.id);
        });
      }

      // Copy tasks
      if (sourceTasks.length > 0) {
        const taskInserts = sourceTasks.map((t) => ({
          template_id: newTemplate.id,
          title: t.title,
          description: t.description,
          order_index: t.order_index,
          visibility: t.visibility,
          assignee_type: t.assignee_type,
          category: t.category,
          requires_file_upload: t.requires_file_upload,
          requires_signature: t.requires_signature,
          depends_on: null, // Don't copy depends_on (would reference old task IDs)
          stage_id: t.stage_id ? stageIdMap.get(t.stage_id) || null : null,
          due_days_offset: t.due_days_offset,
        }));

        await supabaseRest<TemplateTask[]>('onboarding_template_tasks', {
          method: 'POST',
          body: JSON.stringify(taskInserts),
          prefer: 'return=representation',
        });
      }

      return NextResponse.json(newTemplate, { status: 201 });
    }

    // Normal create flow
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
