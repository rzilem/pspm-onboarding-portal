import { NextRequest, NextResponse } from 'next/server';
import { validateCrmApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Project, Task } from '@/lib/types';

export async function GET(req: NextRequest) {
  const authError = validateCrmApiKey(req);
  if (authError) return authError;

  try {
    const dealId = req.nextUrl.searchParams.get('deal_id');
    if (!dealId) {
      return NextResponse.json({ error: 'deal_id query param required' }, { status: 400 });
    }

    const projects = await supabaseRest<Project[]>(
      `onboarding_projects?source_deal_id=eq.${encodeURIComponent(dealId)}&order=created_at.desc`,
    );

    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = validateCrmApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    if (!body.name || !body.source_deal_id) {
      return NextResponse.json(
        { error: 'name and source_deal_id are required' },
        { status: 400 },
      );
    }

    // Create project
    const [project] = await supabaseRest<Project[]>('onboarding_projects', {
      method: 'POST',
      body: JSON.stringify({
        name: body.name,
        source_deal_id: body.source_deal_id,
        source_deal_name: body.source_deal_name || null,
        client_company_name: body.client_company_name || null,
        client_contact_name: body.client_contact_name || null,
        client_contact_email: body.client_contact_email || null,
        community_name: body.community_name || null,
        total_units: body.total_units || null,
        template_id: body.template_id || null,
        status: 'active',
        started_at: new Date().toISOString(),
      }),
      prefer: 'return=representation',
    });

    // If template_id was provided, copy template tasks
    if (body.template_id) {
      const templateTasks = await supabaseRest<Array<Record<string, unknown>>>(
        `onboarding_template_tasks?template_id=eq.${body.template_id}&order=order_index`,
      );

      if (templateTasks.length > 0) {
        const projectTasks = templateTasks.map((tt) => ({
          project_id: project.id,
          template_task_id: tt.id,
          title: tt.title,
          description: tt.description,
          order_index: tt.order_index,
          visibility: tt.visibility,
          assignee_type: tt.assignee_type,
          category: tt.category,
          requires_file_upload: tt.requires_file_upload,
          requires_signature: tt.requires_signature,
        }));

        await supabaseRest('onboarding_tasks', {
          method: 'POST',
          body: JSON.stringify(projectTasks),
          prefer: 'return=minimal',
        });
      }
    }

    await logActivity({
      project_id: project.id,
      actor: 'CRM',
      actor_type: 'system',
      action: 'project_created_from_crm',
      details: { source_deal_id: body.source_deal_id },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
