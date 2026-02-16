import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import crypto from 'crypto';

/**
 * Validate ADMIN_API_KEY from request headers.
 * Accepts both `Authorization: Bearer <key>` and `X-API-Key: <key>`.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function validateApiKey(
  req: NextRequest,
  envVar: string = 'ADMIN_API_KEY',
): NextResponse | null {
  const expectedKey = process.env[envVar];
  if (!expectedKey) {
    return NextResponse.json(
      { error: 'Server misconfiguration: API key not set' },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('x-api-key');

  let providedKey: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7);
  } else if (apiKeyHeader) {
    providedKey = apiKeyHeader;
  }

  if (!providedKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  // Timing-safe comparison
  const expected = Buffer.from(expectedKey);
  const provided = Buffer.from(providedKey);

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  return null; // Valid
}

/**
 * Validate CRM API key specifically
 */
export function validateCrmApiKey(req: NextRequest): NextResponse | null {
  return validateApiKey(req, 'CRM_API_KEY');
}

/**
 * Check if user has an active NextAuth session (MS Entra ID).
 * For use in dashboard API routes.
 */
export async function requireSession(): Promise<
  | { session: { user?: { name?: string | null; email?: string | null; image?: string | null } } }
  | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return {
      error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    };
  }
  return { session };
}

/**
 * Validate a portal token from the URL.
 * Returns the project if valid, or null.
 */
export async function validatePortalToken(
  token: string,
): Promise<{ id: string; name: string; status: string } | null> {
  if (!token || token.length < 16) return null;

  const { supabaseRest } = await import('@/lib/supabase');

  try {
    const projects = await supabaseRest<Array<{ id: string; name: string; status: string }>>(
      `onboarding_projects?public_token=eq.${encodeURIComponent(token)}&select=id,name,status&limit=1`,
    );

    if (!projects.length) return null;

    const project = projects[0];

    // Only allow access to active/paused/completed projects
    if (['draft', 'cancelled'].includes(project.status)) return null;

    return project;
  } catch {
    return null;
  }
}
