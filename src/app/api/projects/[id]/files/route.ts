import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { OnboardingFile } from '@/lib/types';

/**
 * GET /api/projects/[id]/files — List files for a project
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const files = await supabaseRest<OnboardingFile[]>(
      `onboarding_files?project_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc`,
    );

    return NextResponse.json(files);
  } catch (err) {
    console.error('[api/projects/[id]/files] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
