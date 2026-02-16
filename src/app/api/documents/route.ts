import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Document } from '@/lib/types';

/**
 * GET /api/documents — List document templates
 * Supports ?active_only=true
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    let path = 'onboarding_documents?select=*&order=created_at.desc';

    const activeOnly = req.nextUrl.searchParams.get('active_only');
    if (activeOnly === 'true') {
      path += '&is_active=eq.true';
    }

    const documents = await supabaseRest<Document[]>(path);

    return NextResponse.json(documents);
  } catch (err) {
    console.error('[api/documents] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/documents — Create a document template
 */
export async function POST(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const { name, description, template_url, category, requires_signature } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const documentPayload = {
      name,
      description: description || null,
      template_url: template_url || null,
      category: category || 'agreement',
      requires_signature: requires_signature ?? false,
    };

    const [created] = await supabaseRest<Document[]>('onboarding_documents', {
      method: 'POST',
      body: JSON.stringify(documentPayload),
      prefer: 'return=representation',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/documents] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
