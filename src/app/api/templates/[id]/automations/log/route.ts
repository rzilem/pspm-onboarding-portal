import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';

interface AutomationLogRow {
  id: string;
  automation_id: string;
  project_id: string;
  trigger_event: Record<string, unknown> | null;
  action_result: Record<string, unknown> | null;
  status: string;
  error_message: string | null;
  executed_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
}

interface AutomationRow {
  id: string;
  name: string;
}

/**
 * GET /api/templates/[id]/automations/log — Fetch recent automation execution logs
 * Query params: ?limit=50 (default 50, max 200)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get('limit') || '50', 10),
      200,
    );

    // Get automation IDs for this template
    const automations = await supabaseRest<AutomationRow[]>(
      `onboarding_automations?template_id=eq.${encodeURIComponent(id)}&select=id,name`,
    );

    if (!automations.length) {
      return NextResponse.json([]);
    }

    const automationIds = automations.map((a) => a.id);
    const automationMap = new Map(automations.map((a) => [a.id, a.name]));

    // Fetch logs for these automations
    const logs = await supabaseRest<AutomationLogRow[]>(
      `onboarding_automation_log?automation_id=in.(${automationIds.join(',')})&select=*&order=executed_at.desc&limit=${limit}`,
    );

    if (!logs.length) {
      return NextResponse.json([]);
    }

    // Fetch project names for the logs
    const projectIds = [...new Set(logs.map((l) => l.project_id))];
    const projects = await supabaseRest<ProjectRow[]>(
      `onboarding_projects?id=in.(${projectIds.join(',')})&select=id,name`,
    );
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    // Enrich logs with project and automation names
    const enrichedLogs = logs.map((log) => ({
      ...log,
      project_name: projectMap.get(log.project_id) || 'Unknown',
      automation_name: automationMap.get(log.automation_id) || 'Unknown',
    }));

    return NextResponse.json(enrichedLogs);
  } catch (err) {
    console.error('[api/templates/[id]/automations/log] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
