import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Project, Task, ClientSummary } from '@/lib/types';

/**
 * GET /api/clients — Aggregated client directory
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    // Fetch all projects (excluding cancelled)
    const projects = await supabaseRest<Project[]>(
      'onboarding_projects?status=neq.cancelled&select=id,name,status,client_contact_name,client_contact_email,client_contact_phone,community_name,updated_at&order=updated_at.desc',
    );

    // Fetch all tasks to compute progress
    const projectIds = projects.map((p) => p.id);
    let allTasks: Task[] = [];
    if (projectIds.length > 0) {
      allTasks = await supabaseRest<Task[]>(
        `onboarding_tasks?project_id=in.(${projectIds.join(',')})&select=id,project_id,status`,
      );
    }

    // Group tasks by project
    const tasksByProject = new Map<string, Task[]>();
    for (const task of allTasks) {
      const existing = tasksByProject.get(task.project_id) || [];
      tasksByProject.set(task.project_id, [...existing, task]);
    }

    // Group projects by client email
    const clientMap = new Map<string, ClientSummary>();

    for (const project of projects) {
      const email = project.client_contact_email;
      if (!email) continue;

      const projectTasks = tasksByProject.get(project.id) || [];
      const completedTasks = projectTasks.filter((t) => t.status === 'completed').length;
      const progress = projectTasks.length > 0 ? Math.round((completedTasks / projectTasks.length) * 100) : 0;

      const existing = clientMap.get(email);
      if (existing) {
        existing.project_count++;
        if (project.status === 'active') existing.active_count++;
        if (project.status === 'completed') existing.completed_count++;
        if (!existing.last_activity || project.updated_at > existing.last_activity) {
          existing.last_activity = project.updated_at;
        }
        existing.projects.push({
          id: project.id,
          name: project.name,
          status: project.status,
          progress,
        });
      } else {
        clientMap.set(email, {
          email,
          name: project.client_contact_name,
          phone: project.client_contact_phone,
          community: project.community_name,
          project_count: 1,
          active_count: project.status === 'active' ? 1 : 0,
          completed_count: project.status === 'completed' ? 1 : 0,
          last_activity: project.updated_at,
          projects: [{
            id: project.id,
            name: project.name,
            status: project.status,
            progress,
          }],
        });
      }
    }

    const clients = Array.from(clientMap.values()).sort((a, b) => {
      if (a.last_activity && b.last_activity) return b.last_activity.localeCompare(a.last_activity);
      return 0;
    });

    return NextResponse.json(clients);
  } catch (err) {
    console.error('[api/clients] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
