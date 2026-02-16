import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Project, Task } from '@/lib/types';

export interface ProjectHealth {
  id: string;
  name: string;
  community_name: string | null;
  assigned_staff_email: string | null;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  days_active: number;
  overdue_count: number;
  health: 'healthy' | 'at_risk' | 'critical';
}

function calculateHealth(
  progress: number,
  daysActive: number,
  overdueCount: number,
): 'healthy' | 'at_risk' | 'critical' {
  if (overdueCount > 3 || (progress < 25 && daysActive > 30)) {
    return 'critical';
  }
  if (overdueCount > 0 || (progress < 50 && daysActive > 14)) {
    return 'at_risk';
  }
  return 'healthy';
}

const HEALTH_ORDER: Record<string, number> = {
  critical: 0,
  at_risk: 1,
  healthy: 2,
};

/**
 * GET /api/reports/health — Per-project health data for the dashboard
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    // Fetch active projects and their tasks in parallel
    const [activeProjects, allTasks] = await Promise.all([
      supabaseRest<Project[]>(
        'onboarding_projects?select=id,name,community_name,assigned_staff_email,started_at,created_at&status=eq.active',
      ),
      supabaseRest<Array<Pick<Task, 'id' | 'project_id' | 'status' | 'due_date'>>>(
        'onboarding_tasks?select=id,project_id,status,due_date',
      ),
    ]);

    const now = new Date();

    // Group tasks by project
    const tasksByProject: Record<string, Array<Pick<Task, 'id' | 'project_id' | 'status' | 'due_date'>>> = {};
    for (const task of allTasks) {
      if (!tasksByProject[task.project_id]) {
        tasksByProject[task.project_id] = [];
      }
      tasksByProject[task.project_id].push(task);
    }

    const results: ProjectHealth[] = activeProjects.map((project) => {
      const tasks = tasksByProject[project.id] || [];
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(
        (t) => t.status === 'completed',
      ).length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const startDate = project.started_at || project.created_at;
      const daysActive = Math.floor(
        (now.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24),
      );

      const overdueCount = tasks.filter(
        (t) =>
          t.status !== 'completed' &&
          t.status !== 'skipped' &&
          t.due_date &&
          new Date(t.due_date) < now,
      ).length;

      const health = calculateHealth(progress, daysActive, overdueCount);

      return {
        id: project.id,
        name: project.name,
        community_name: project.community_name,
        assigned_staff_email: project.assigned_staff_email,
        progress,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        days_active: daysActive,
        overdue_count: overdueCount,
        health,
      };
    });

    // Sort: critical first, then at_risk, then healthy
    results.sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]);

    return NextResponse.json(results);
  } catch (err) {
    console.error('[api/reports/health] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
