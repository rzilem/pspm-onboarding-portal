import { NextRequest, NextResponse } from 'next/server';
import { validateCrmApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { ActivityLog } from '@/lib/types';

/**
 * GET /api/crm/projects/[id]/activity — Activity log for a project
 * Auth: CRM_API_KEY (used by Propello AI CRM timeline)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateCrmApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

    const activity = await supabaseRest<ActivityLog[]>(
      `onboarding_activity_log?project_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=${limit}`,
    );

    return NextResponse.json(activity);
  } catch (err) {
    console.error('[api/crm/projects/[id]/activity] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
