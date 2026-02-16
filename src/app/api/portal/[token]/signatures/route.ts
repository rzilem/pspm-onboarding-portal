import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';
import { validatePortalToken } from '@/lib/auth';
import type { Signature } from '@/lib/types';

/**
 * GET /api/portal/[token]/signatures
 * List all signatures for this project (all statuses so client sees full picture).
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
    const signatures = await supabaseRest<Signature[]>(
      `onboarding_signatures?project_id=eq.${project.id}&order=requested_at.asc`,
    );

    return NextResponse.json(signatures);
  } catch (err) {
    console.error('[portal/signatures] Failed to list signatures:', err);
    return NextResponse.json({ error: 'Failed to list signatures' }, { status: 500 });
  }
}
