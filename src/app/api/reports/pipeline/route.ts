import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Project, Task, Stage } from '@/lib/types';

interface PipelineResponse {
  by_status: {
    draft: number;
    active: number;
    paused: number;
    completed: number;
    cancelled: number;
  };
  completion_timeline: Array<{
    month: string;
    completed: number;
    started: number;
  }>;
  stage_distribution: Array<{
    stage_name: string;
    project_count: number;
    avg_progress: number;
  }>;
}

/**
 * GET /api/reports/pipeline — Project pipeline data for the dashboard
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    // Fetch all data in parallel
    const [allProjects, allTasks, allStages] = await Promise.all([
      supabaseRest<Project[]>(
        'onboarding_projects?select=id,status,started_at,completed_at,created_at',
      ),
      supabaseRest<Array<Pick<Task, 'id' | 'project_id' | 'status' | 'stage_id'>>>(
        'onboarding_tasks?select=id,project_id,status,stage_id',
      ),
      supabaseRest<Array<Pick<Stage, 'id' | 'name' | 'project_id'>>>(
        'onboarding_stages?select=id,name,project_id&project_id=not.is.null',
      ),
    ]);

    // --- by_status ---
    const byStatus = {
      draft: 0,
      active: 0,
      paused: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const p of allProjects) {
      if (p.status in byStatus) {
        byStatus[p.status as keyof typeof byStatus]++;
      }
    }

    // --- completion_timeline (last 6 months) ---
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const completionTimeline = months.map((month) => {
      const [year, mon] = month.split('-').map(Number);

      const completed = allProjects.filter((p) => {
        if (!p.completed_at) return false;
        const d = new Date(p.completed_at);
        return d.getFullYear() === year && d.getMonth() + 1 === mon;
      }).length;

      const started = allProjects.filter((p) => {
        const startDate = p.started_at || p.created_at;
        if (!startDate) return false;
        const d = new Date(startDate);
        return d.getFullYear() === year && d.getMonth() + 1 === mon;
      }).length;

      // Format as "Jan 2026"
      const label = new Date(year, mon - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      return { month: label, completed, started };
    });

    // --- stage_distribution ---
    // Build task counts per project
    const tasksByProject: Record<string, { total: number; completed: number }> = {};
    for (const t of allTasks) {
      if (!tasksByProject[t.project_id]) {
        tasksByProject[t.project_id] = { total: 0, completed: 0 };
      }
      tasksByProject[t.project_id].total++;
      if (t.status === 'completed') {
        tasksByProject[t.project_id].completed++;
      }
    }

    // Group stages by name, collecting project IDs
    const stageNameMap: Record<string, Set<string>> = {};
    for (const stage of allStages) {
      if (!stage.project_id) continue;
      if (!stageNameMap[stage.name]) {
        stageNameMap[stage.name] = new Set();
      }
      stageNameMap[stage.name].add(stage.project_id);
    }

    const stageDistribution = Object.entries(stageNameMap).map(
      ([stageName, projectIds]) => {
        const projectIdArr = Array.from(projectIds);
        const projectCount = projectIdArr.length;

        const totalProgress = projectIdArr.reduce((sum, pid) => {
          const counts = tasksByProject[pid];
          if (!counts || counts.total === 0) return sum;
          return sum + Math.round((counts.completed / counts.total) * 100);
        }, 0);

        const avgProgress =
          projectCount > 0 ? Math.round(totalProgress / projectCount) : 0;

        return {
          stage_name: stageName,
          project_count: projectCount,
          avg_progress: avgProgress,
        };
      },
    );

    // Sort stage distribution by project count descending
    stageDistribution.sort((a, b) => b.project_count - a.project_count);

    const response: PipelineResponse = {
      by_status: byStatus,
      completion_timeline: completionTimeline,
      stage_distribution: stageDistribution,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[api/reports/pipeline] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
