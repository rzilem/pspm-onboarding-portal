import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import { evaluateAutomations } from '@/lib/automation-engine';
import type { Project, TemplateTask, Stage, Tag } from '@/lib/types';

/**
 * GET /api/projects — List all projects with tags
 * Supports query params:
 *   ?status=active — filter by project status
 *   ?search=keyword — search in name, community, client name
 *   ?staff=email — filter by assigned staff email
 *   ?tag=<tag_id> — filter by tag (applied after tag join)
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

    const staff = req.nextUrl.searchParams.get('staff');
    if (staff) {
      path += `&assigned_staff_email=eq.${encodeURIComponent(staff)}`;
    }

    const projects = await supabaseRest<Project[]>(path);

    // Fetch task counts and project tags in parallel
    const projectIds = projects.map((p) => p.id);
    const taskCounts: Record<string, { total: number; completed: number; overdue: number }> = {};
    const projectTagsMap: Record<string, Tag[]> = {};

    if (projectIds.length > 0) {
      const [tasks, projectTags] = await Promise.all([
        supabaseRest<Array<{ project_id: string; status: string; due_date: string | null }>>(
          `onboarding_tasks?select=project_id,status,due_date&project_id=in.(${projectIds.join(',')})`,
        ),
        supabaseRest<Array<{ project_id: string; tag: Tag }>>(
          `onboarding_project_tags?select=project_id,tag:onboarding_tags(id,name,color)&project_id=in.(${projectIds.join(',')})`,
        ),
      ]);

      const now = new Date();
      for (const task of tasks) {
        if (!taskCounts[task.project_id]) {
          taskCounts[task.project_id] = { total: 0, completed: 0, overdue: 0 };
        }
        taskCounts[task.project_id].total++;
        if (task.status === 'completed') {
          taskCounts[task.project_id].completed++;
        }
        if (task.due_date && task.status !== 'completed' && task.status !== 'skipped' && new Date(task.due_date) < now) {
          taskCounts[task.project_id].overdue++;
        }
      }

      for (const pt of projectTags) {
        if (!projectTagsMap[pt.project_id]) {
          projectTagsMap[pt.project_id] = [];
        }
        if (pt.tag) {
          projectTagsMap[pt.project_id].push(pt.tag);
        }
      }
    }

    let result = projects.map((project) => {
      const counts = taskCounts[project.id] ?? { total: 0, completed: 0, overdue: 0 };
      const daysActive = project.started_at
        ? Math.floor((Date.now() - new Date(project.started_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        community_name: project.community_name,
        client_contact_name: project.client_contact_name,
        assigned_staff_email: project.assigned_staff_email,
        progress: counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0,
        total_tasks: counts.total,
        completed_tasks: counts.completed,
        days_active: daysActive,
        tags: projectTagsMap[project.id] ?? [],
        overdue_tasks: counts.overdue,
        created_at: project.created_at,
      };
    });

    // Client-side tag filter (PostgREST cannot filter on joined tables directly)
    const tagFilter = req.nextUrl.searchParams.get('tag');
    if (tagFilter) {
      result = result.filter((p) => p.tags.some((t) => t.id === tagFilter));
    }

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

    // If template_id is provided, copy template stages and tasks into onboarding_stages and onboarding_tasks
    if (template_id && created) {
      try {
        // Copy template stages first
        const templateStages = await supabaseRest<Array<{ id: string; name: string; description: string | null; order_index: number }>>(
          `onboarding_stages?template_id=eq.${encodeURIComponent(template_id)}&order=order_index&select=id,name,description,order_index`,
        );

        const stageIdMap: Record<string, string> = {}; // old stage ID -> new stage ID

        if (templateStages.length > 0) {
          for (const templateStage of templateStages) {
            const [createdStage] = await supabaseRest<Array<{ id: string }>>(
              'onboarding_stages',
              {
                method: 'POST',
                body: JSON.stringify({
                  project_id: created.id,
                  name: templateStage.name,
                  description: templateStage.description,
                  order_index: templateStage.order_index,
                  status: 'pending',
                }),
                prefer: 'return=representation',
              },
            );
            if (createdStage) {
              stageIdMap[templateStage.id] = createdStage.id;
            }
          }
        }

        // Copy template tasks
        const templateTasks = await supabaseRest<TemplateTask[]>(
          `onboarding_template_tasks?template_id=eq.${encodeURIComponent(template_id)}&order=order_index`,
        );

        if (templateTasks.length > 0) {
          const taskInserts = templateTasks.map((tt) => {
            const taskData: Record<string, unknown> = {
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
            };

            // Map old stage_id to new project stage_id
            if (tt.stage_id && stageIdMap[tt.stage_id]) {
              taskData.stage_id = stageIdMap[tt.stage_id];
            }

            // Calculate due_date if management_start_date and due_days_offset are both present
            if (management_start_date && tt.due_days_offset != null) {
              const startDate = new Date(management_start_date);
              const dueDate = new Date(startDate);
              dueDate.setDate(dueDate.getDate() + tt.due_days_offset);
              taskData.due_date = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD
            }

            return taskData;
          });

          await supabaseRest('onboarding_tasks', {
            method: 'POST',
            body: JSON.stringify(taskInserts),
            prefer: 'return=minimal',
          });
        }
      } catch (templateErr) {
        console.error('[api/projects] Failed to copy template tasks/stages:', templateErr);
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

    // Trigger automations on project creation (fire-and-forget)
    evaluateAutomations(created.id, { type: 'project_created' }).catch(console.error);

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/projects] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
