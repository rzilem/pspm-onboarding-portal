import { NextRequest, NextResponse } from 'next/server';
import { validateCrmApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Project, Task, Signature, Document, CrmProjectSummary, CrmSignatureDetail } from '@/lib/types';
import { calcProgress } from '@/lib/utils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateCrmApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const [projects, tasks, signatures] = await Promise.all([
      supabaseRest<Project[]>(`onboarding_projects?id=eq.${id}&limit=1`),
      supabaseRest<Task[]>(`onboarding_tasks?project_id=eq.${id}&order=order_index`),
      supabaseRest<Signature[]>(`onboarding_signatures?project_id=eq.${id}`),
    ]);

    if (!projects.length) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projects[0];
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const progress = calcProgress(completedTasks, tasks.length);
    const pendingSigs = signatures.filter((s) => ['pending', 'sent', 'viewed'].includes(s.status)).length;

    // Fetch document names for signatures with document_id
    const docIds = [...new Set(signatures.filter((s) => s.document_id).map((s) => s.document_id!))];
    const docMap = new Map<string, string>();
    if (docIds.length > 0) {
      const docs = await supabaseRest<Document[]>(
        `onboarding_documents?id=in.(${docIds.join(',')})\&select=id,name`,
      );
      for (const doc of docs) {
        docMap.set(doc.id, doc.name);
      }
    }

    const signatureDetails: CrmSignatureDetail[] = signatures.map((s) => ({
      id: s.id,
      signer_name: s.signer_name,
      document_name: s.document_id ? docMap.get(s.document_id) || null : null,
      status: s.status,
    }));

    // Calculate days active
    let daysActive: number | null = null;
    if (project.started_at) {
      daysActive = Math.floor(
        (Date.now() - new Date(project.started_at).getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    // Determine next action
    let nextAction: string | null = null;
    const pendingTasks = tasks.filter((t) => t.status === 'pending' && t.visibility === 'external');
    if (pendingSigs > 0) {
      nextAction = `${pendingSigs} signature${pendingSigs > 1 ? 's' : ''} pending`;
    } else if (pendingTasks.length > 0) {
      nextAction = pendingTasks[0].title;
    } else if (progress < 100) {
      const internalPending = tasks.filter((t) => t.status !== 'completed' && t.visibility === 'internal');
      if (internalPending.length > 0) nextAction = `Staff: ${internalPending[0].title}`;
    }

    const portalUrl = `${req.nextUrl.origin}/p/${project.public_token}`;

    const summary: CrmProjectSummary = {
      id: project.id,
      name: project.name,
      status: project.status,
      progress,
      days_active: daysActive,
      next_action: nextAction,
      portal_url: portalUrl,
      total_tasks: tasks.length,
      completed_tasks: completedTasks,
      pending_signatures: pendingSigs,
      signatures: signatureDetails,
    };

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
