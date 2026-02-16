import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { ActivityLog } from '@/lib/types';

/**
 * GET /api/projects/[id]/activity — List activity log for a project
 * Supports ?limit=50 (default 50)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 500) : 50;

    const activity = await supabaseRest<ActivityLog[]>(
      `onboarding_activity_log?project_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=${limit}`,
    );

    return NextResponse.json(activity);
  } catch (err) {
    console.error('[api/projects/[id]/activity] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
