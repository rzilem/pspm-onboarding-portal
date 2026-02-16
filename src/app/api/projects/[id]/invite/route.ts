import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import { sendClientInvite } from '@/lib/email';
import { logActivity } from '@/lib/activity';
import type { Project } from '@/lib/types';

/**
 * POST /api/projects/[id]/invite — Send portal invite email to client
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    // Fetch project
    const [project] = await supabaseRest<Project[]>(
      `onboarding_projects?id=eq.${encodeURIComponent(id)}&select=*`,
    );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.client_contact_email) {
      return NextResponse.json(
        { error: 'Project has no client contact email' },
        { status: 400 },
      );
    }

    // Send invite email
    const result = await sendClientInvite({
      to: project.client_contact_email,
      clientName: project.client_contact_name || 'there',
      projectName: project.name,
      communityName: project.community_name || undefined,
      portalToken: project.public_token,
      project_id: project.id,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to send email (check RESEND_API_KEY)' },
        { status: 500 },
      );
    }

    // Log activity
    await logActivity({
      project_id: id,
      actor: 'system',
      actor_type: 'staff',
      action: `Sent portal invite to ${project.client_contact_email}`,
      details: { email_id: result.id },
    });

    return NextResponse.json({ success: true, email_id: result.id });
  } catch (err) {
    console.error('[api/projects/[id]/invite] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
