import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Tag } from '@/lib/types';

/**
 * GET /api/tags — List all tags ordered by name
 */
export async function GET(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const tags = await supabaseRest<Tag[]>(
      'onboarding_tags?select=*&order=name',
    );

    return NextResponse.json(tags);
  } catch (err) {
    console.error('[api/tags] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/tags — Create a new tag
 * Body: { name: string, color: string }
 */
export async function POST(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const payload: Record<string, string> = {
      name: name.trim(),
    };

    if (color && typeof color === 'string') {
      payload.color = color;
    }

    const [created] = await supabaseRest<Tag[]>('onboarding_tags', {
      method: 'POST',
      body: JSON.stringify(payload),
      prefer: 'return=representation',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/tags] POST error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    // Handle unique constraint violation
    if (message.includes('duplicate') || message.includes('unique')) {
      return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
