import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Project, TemplateTask } from '@/lib/types';

/**
 * GET /api/projects — List all projects
 * Supports ?status=active and ?search=keyword query params
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    let path = 'onboarding_projects?select=*&order=created_at.desc';

    const status = req.nextUrl.searchParams.get('status');
    if (status) {
      path += `&status=eq.${encodeURIComponent(status)}`;
    }

    const search = req.nextUrl.searchParams.get('search');
    if (search) {
      const encoded = encodeURIComponent(search);
      path += `&or=(name.ilike.*${encoded}*,community_name.ilike.*${encoded}*,client_company_name.ilike.*${encoded}*,client_contact_name.ilike.*${encoded}*)`;
    }

    const projects = await supabaseRest<Project[]>(path);

    // Fetch task counts for each project
    const projectIds = projects.map((p) => p.id);
    let taskCounts: Record<string, { total: number; completed: number }> = {};

    if (projectIds.length > 0) {
      const tasks = await supabaseRest<Array<{ project_id: string; status: string }>>(
        `onboarding_tasks?select=project_id,status&project_id=in.(${projectIds.join(',')})`,
      );

      for (const task of tasks) {
        if (!taskCounts[task.project_id]) {
          taskCounts[task.project_id] = { total: 0, completed: 0 };
        }
        taskCounts[task.project_id].total++;
        if (task.status === 'completed') {
          taskCounts[task.project_id].completed++;
        }
      }
    }

    const result = projects.map((project) => ({
      ...project,
      total_tasks: taskCounts[project.id]?.total ?? 0,
      completed_tasks: taskCounts[project.id]?.completed ?? 0,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/projects] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects — Create a new project
 * If template_id is provided, copies template tasks into onboarding_tasks
 */
export async function POST(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const {
      name,
      template_id,
      source_deal_id,
      source_deal_name,
      client_company_name,
      client_contact_name,
      client_contact_email,
      client_contact_phone,
      community_name,
      total_units,
      management_start_date,
      assigned_staff_email,
      target_completion_date,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Create the project
    const projectPayload: Record<string, unknown> = {
      name,
      template_id: template_id || null,
      source_deal_id: source_deal_id || null,
      source_deal_name: source_deal_name || null,
      client_company_name: client_company_name || null,
      client_contact_name: client_contact_name || null,
      client_contact_email: client_contact_email || null,
      client_contact_phone: client_contact_phone || null,
      community_name: community_name || null,
      total_units: total_units || null,
      management_start_date: management_start_date || null,
      assigned_staff_email: assigned_staff_email || null,
      target_completion_date: target_completion_date || null,
    };

    const [created] = await supabaseRest<Project[]>('onboarding_projects', {
      method: 'POST',
      body: JSON.stringify(projectPayload),
      prefer: 'return=representation',
    });

    // If template_id is provided, copy template tasks into onboarding_tasks
    if (template_id && created) {
      try {
        const templateTasks = await supabaseRest<TemplateTask[]>(
          `onboarding_template_tasks?template_id=eq.${encodeURIComponent(template_id)}&order=order_index`,
        );

        if (templateTasks.length > 0) {
          const taskInserts = templateTasks.map((tt) => ({
            project_id: created.id,
            template_task_id: tt.id,
            title: tt.title,
            description: tt.description,
            order_index: tt.order_index,
            visibility: tt.visibility,
            assignee_type: tt.assignee_type,
            category: tt.category,
            requires_file_upload: tt.requires_file_upload,
            requires_signature: tt.requires_signature,
            depends_on: tt.depends_on,
          }));

          await supabaseRest('onboarding_tasks', {
            method: 'POST',
            body: JSON.stringify(taskInserts),
            prefer: 'return=minimal',
          });
        }
      } catch (templateErr) {
        console.error('[api/projects] Failed to copy template tasks:', templateErr);
        // Project was created — don't fail the whole request, but note it in activity log
        logActivity({
          project_id: created.id,
          actor: 'system',
          actor_type: 'system',
          action: 'template_copy_failed',
          details: { template_id, error: String(templateErr) },
        });
      }
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: created.id,
      actor: assigned_staff_email || 'system',
      actor_type: assigned_staff_email ? 'staff' : 'system',
      action: 'project_created',
      details: {
        name: created.name,
        template_id: template_id || null,
        community_name: community_name || null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/projects] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
