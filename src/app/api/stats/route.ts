import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Project, Signature, Task, DashboardStats } from '@/lib/types';

/**
 * GET /api/stats — Return dashboard statistics
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    // Fetch all data in parallel
    const [allProjects, pendingSignatures, allTasks] = await Promise.all([
      supabaseRest<Project[]>(
        'onboarding_projects?select=id,status,started_at,completed_at',
      ),
      supabaseRest<Signature[]>(
        'onboarding_signatures?select=id&status=in.(pending,sent)',
      ),
      supabaseRest<Task[]>(
        'onboarding_tasks?select=id,project_id,status,requires_file_upload',
      ),
    ]);

    const totalProjects = allProjects.length;
    const activeProjects = allProjects.filter((p) => p.status === 'active').length;
    const completedProjects = allProjects.filter((p) => p.status === 'completed').length;

    // Calculate average completion days for completed projects
    let avgCompletionDays: number | null = null;
    const completedWithDates = allProjects.filter(
      (p) => p.status === 'completed' && p.started_at && p.completed_at,
    );
    if (completedWithDates.length > 0) {
      const totalDays = completedWithDates.reduce((sum, p) => {
        const start = new Date(p.started_at!).getTime();
        const end = new Date(p.completed_at!).getTime();
        return sum + (end - start) / (1000 * 60 * 60 * 24);
      }, 0);
      avgCompletionDays = Math.round((totalDays / completedWithDates.length) * 10) / 10;
    }

    // Count pending uploads: tasks requiring file upload that aren't completed
    // (across active projects only)
    const activeProjectIds = new Set(
      allProjects.filter((p) => p.status === 'active').map((p) => p.id),
    );
    const pendingUploads = allTasks.filter(
      (t) =>
        t.requires_file_upload &&
        t.status !== 'completed' &&
        t.status !== 'skipped' &&
        activeProjectIds.has(t.project_id),
    ).length;

    const stats: DashboardStats = {
      total_projects: totalProjects,
      active_projects: activeProjects,
      completed_projects: completedProjects,
      avg_completion_days: avgCompletionDays,
      pending_signatures: pendingSignatures.length,
      pending_uploads: pendingUploads,
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error('[api/stats] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
