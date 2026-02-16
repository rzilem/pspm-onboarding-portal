import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';
import { validatePortalToken } from '@/lib/auth';
import type { Task, OnboardingFile, Signature, Project, PortalView } from '@/lib/types';

/**
 * GET /api/portal/[token]
 * Public portal view — returns project overview, external tasks, progress, signatures, files.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  try {
    // Fetch full project row
    const [fullProject] = await supabaseRest<Project[]>(
      `onboarding_projects?id=eq.${project.id}&select=*&limit=1`,
    );

    if (!fullProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch external tasks ordered by order_index
    const tasks = await supabaseRest<Task[]>(
      `onboarding_tasks?project_id=eq.${project.id}&visibility=eq.external&order=order_index.asc`,
    );

    // Fetch signatures (exclude declined)
    const signatures = await supabaseRest<Signature[]>(
      `onboarding_signatures?project_id=eq.${project.id}&status=neq.declined&select=id,status,signer_name,document_id`,
    );

    // Fetch files
    const files = await supabaseRest<OnboardingFile[]>(
      `onboarding_files?project_id=eq.${project.id}&select=id,file_name,task_id,created_at`,
    );

    // Calculate progress
    const completedTasks = tasks.filter((t) => t.status === 'completed');
    const progress = tasks.length > 0
      ? Math.round((completedTasks.length / tasks.length) * 100)
      : 0;

    const portalView: PortalView = {
      project: {
        id: fullProject.id,
        name: fullProject.name,
        status: fullProject.status,
        community_name: fullProject.community_name,
        client_company_name: fullProject.client_company_name,
        client_contact_name: fullProject.client_contact_name,
        management_start_date: fullProject.management_start_date,
      },
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        status: t.status,
        requires_file_upload: t.requires_file_upload,
        requires_signature: t.requires_signature,
        client_notes: t.client_notes,
        order_index: t.order_index,
        due_date: t.due_date ?? null,
        stage_id: t.stage_id ?? null,
        checklist: t.checklist ?? [],
      })),
      stages: [],
      progress,
      total_tasks: tasks.length,
      completed_tasks: completedTasks.length,
      signatures,
      files,
    };

    return NextResponse.json(portalView);
  } catch (err) {
    console.error('[portal] Failed to load portal view:', err);
    return NextResponse.json({ error: 'Failed to load portal' }, { status: 500 });
  }
}
