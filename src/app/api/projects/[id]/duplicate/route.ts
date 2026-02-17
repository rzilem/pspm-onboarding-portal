import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { generateToken } from '@/lib/utils';
import type { Project, Task, Stage } from '@/lib/types';

/**
 * POST /api/projects/[id]/duplicate — Duplicate a project with tasks and stages
 * Does NOT copy files, signatures, or activity log.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  const { id } = await params;

  try {
    // Fetch the original project
    const [original] = await supabaseRest<Project[]>(
      `onboarding_projects?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    );

    if (!original) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Parse optional body for name override
    let newName = `${original.name} (Copy)`;
    try {
      const body = await req.json();
      if (body.name?.trim()) {
        newName = body.name.trim();
      }
    } catch {
      // No body or invalid JSON — use default name
    }

    // Create the new project
    const newProject = {
      name: newName,
      template_id: original.template_id,
      source_deal_id: original.source_deal_id,
      source_deal_name: original.source_deal_name,
      client_company_name: original.client_company_name,
      client_contact_name: original.client_contact_name,
      client_contact_email: original.client_contact_email,
      client_contact_phone: original.client_contact_phone,
      community_name: original.community_name,
      total_units: original.total_units,
      management_start_date: original.management_start_date,
      public_token: generateToken(32),
      status: 'draft' as const,
      assigned_staff_email: original.assigned_staff_email,
      target_completion_date: original.target_completion_date,
      notes: original.notes,
    };

    const [createdProject] = await supabaseRest<Project[]>(
      'onboarding_projects',
      {
        method: 'POST',
        body: JSON.stringify(newProject),
        prefer: 'return=representation',
      },
    );

    // Copy stages (mapping old IDs to new IDs)
    const stageIdMap = new Map<string, string>();
    const originalStages = await supabaseRest<Stage[]>(
      `onboarding_stages?project_id=eq.${encodeURIComponent(id)}&order=order_index.asc`,
    );

    for (const stage of originalStages) {
      const newStage = {
        project_id: createdProject.id,
        template_id: stage.template_id,
        name: stage.name,
        description: stage.description,
        order_index: stage.order_index,
        status: 'pending' as const,
      };

      const [created] = await supabaseRest<Stage[]>(
        'onboarding_stages',
        {
          method: 'POST',
          body: JSON.stringify(newStage),
          prefer: 'return=representation',
        },
      );

      stageIdMap.set(stage.id, created.id);
    }

    // Copy tasks with remapped stage IDs
    const originalTasks = await supabaseRest<Task[]>(
      `onboarding_tasks?project_id=eq.${encodeURIComponent(id)}&order=order_index.asc`,
    );

    for (const task of originalTasks) {
      const newTask = {
        project_id: createdProject.id,
        template_task_id: task.template_task_id,
        title: task.title,
        description: task.description,
        order_index: task.order_index,
        visibility: task.visibility,
        assignee_type: task.assignee_type,
        assignee_email: task.assignee_email,
        category: task.category,
        requires_file_upload: task.requires_file_upload,
        requires_signature: task.requires_signature,
        status: 'pending' as const,
        depends_on: null,
        staff_notes: task.staff_notes,
        client_notes: null,
        due_date: task.due_date,
        stage_id: task.stage_id ? (stageIdMap.get(task.stage_id) || null) : null,
        checklist: task.checklist?.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          completed: false,
        })) || [],
        due_date_reminder: task.due_date_reminder,
      };

      await supabaseRest(
        'onboarding_tasks',
        {
          method: 'POST',
          body: JSON.stringify(newTask),
          prefer: 'return=minimal',
        },
      );
    }

    // Copy project tags
    try {
      const projectTags = await supabaseRest<Array<{ project_id: string; tag_id: string }>>(
        `onboarding_project_tags?project_id=eq.${encodeURIComponent(id)}`,
      );

      for (const pt of projectTags) {
        await supabaseRest('onboarding_project_tags', {
          method: 'POST',
          body: JSON.stringify({ project_id: createdProject.id, tag_id: pt.tag_id }),
          prefer: 'return=minimal',
        });
      }
    } catch {
      // Tags table may not exist — ignore
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: createdProject.id,
      actor: 'system',
      actor_type: 'staff',
      action: 'project_duplicated',
      details: {
        source_project_id: id,
        source_project_name: original.name,
        tasks_copied: originalTasks.length,
        stages_copied: originalStages.length,
      },
    });

    return NextResponse.json(createdProject, { status: 201 });
  } catch (err) {
    console.error('[api/projects/[id]/duplicate] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
