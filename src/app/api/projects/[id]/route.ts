import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Project, Task, OnboardingFile, Signature } from '@/lib/types';

/**
 * GET /api/projects/[id] — Fetch a single project with tasks, file count, signature count
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    // Fetch project, tasks, files count, signatures count in parallel
    const [projects, tasks, files, signatures] = await Promise.all([
      supabaseRest<Project[]>(
        `onboarding_projects?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      ),
      supabaseRest<Task[]>(
        `onboarding_tasks?project_id=eq.${encodeURIComponent(id)}&select=*&order=order_index`,
      ),
      supabaseRest<OnboardingFile[]>(
        `onboarding_files?project_id=eq.${encodeURIComponent(id)}&select=id`,
      ),
      supabaseRest<Signature[]>(
        `onboarding_signatures?project_id=eq.${encodeURIComponent(id)}&select=id`,
      ),
    ]);

    if (!projects.length) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...projects[0],
      tasks,
      files_count: files.length,
      signatures_count: signatures.length,
    });
  } catch (err) {
    console.error('[api/projects/[id]] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/projects/[id] — Update project fields
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();

    // Auto-set timestamps on status transitions
    if (body.status === 'active') {
      // Only set started_at if it's currently null — fetch current project
      const [existing] = await supabaseRest<Project[]>(
        `onboarding_projects?id=eq.${encodeURIComponent(id)}&select=started_at&limit=1`,
      );
      if (existing && !existing.started_at) {
        body.started_at = new Date().toISOString();
      }
    }

    if (body.status === 'completed') {
      body.completed_at = new Date().toISOString();
    }

    const updated = await supabaseRest<Project[]>(
      `onboarding_projects?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      actor: body.assigned_staff_email || 'system',
      actor_type: 'staff',
      action: 'project_updated',
      details: {
        updated_fields: Object.keys(body),
        status: body.status || undefined,
      },
    });

    return NextResponse.json(updated[0]);
  } catch (err) {
    console.error('[api/projects/[id]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[id] — Soft-delete by setting status to 'cancelled'
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const updated = await supabaseRest<Project[]>(
      `onboarding_projects?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
        prefer: 'return=representation',
      },
    );

    if (!updated.length) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Log activity (fire-and-forget)
    logActivity({
      project_id: id,
      actor: 'system',
      actor_type: 'staff',
      action: 'project_cancelled',
      details: { previous_status: updated[0].status },
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[api/projects/[id]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
