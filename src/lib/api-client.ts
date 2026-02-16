/**
 * Server-side API helpers for PSPM Onboarding Portal.
 * Common patterns used across multiple API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from './auth';
import { supabaseRest } from './supabase';

/**
 * Standard error response helper.
 */
export function errorResponse(message: string, status: number = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wrap an API handler with auth validation and error handling.
 * Reduces boilerplate in route handlers.
 */
export function withAuth(
  handler: (req: NextRequest) => Promise<NextResponse>,
  envVar: string = 'ADMIN_API_KEY',
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authError = validateApiKey(req, envVar);
    if (authError) return authError;

    try {
      return await handler(req);
    } catch (err) {
      console.error(`[API] Error:`, err);
      return errorResponse(
        err instanceof Error ? err.message : 'Internal server error',
      );
    }
  };
}

/**
 * Parse and validate a UUID from URL params.
 * Returns null if invalid format.
 */
export function parseUUID(value: string | undefined): string | null {
  if (!value) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value) ? value : null;
}

/**
 * Paginate a Supabase REST query.
 * Returns the path suffix for limit/offset.
 */
export function paginationParams(req: NextRequest, defaultLimit: number = 50): string {
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get('limit') || String(defaultLimit), 10),
    200,
  );
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10);
  return `&limit=${limit}&offset=${offset}`;
}
