import { NextRequest, NextResponse } from 'next/server';
import { validateCrmApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';

/**
 * GET /api/crm/templates — List active onboarding templates
 * Auth: CRM_API_KEY (not ADMIN_API_KEY)
 * Used by Propello AI CRM to populate template picker
 */
export async function GET(req: NextRequest) {
  const authError = validateCrmApiKey(req);
  if (authError) return authError;

  try {
    const templates = await supabaseRest<Array<{
      id: string;
      name: string;
      description: string | null;
      estimated_days: number | null;
      is_active: boolean;
    }>>(
      'onboarding_templates?select=id,name,description,estimated_days,is_active&is_active=eq.true&order=name',
    );

    return NextResponse.json(templates);
  } catch (err) {
    console.error('[api/crm/templates] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
