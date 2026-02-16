'use client';

/**
 * Shared client-side hooks for PSPM Onboarding Portal
 */

/**
 * Get the admin API key from sessionStorage.
 * All dashboard pages use this to authenticate API requests.
 */
export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('admin_api_key') || '';
  }
  return '';
}

/**
 * Get standard headers for authenticated API requests.
 */
export function getAuthHeaders(): Record<string, string> {
  return { 'X-API-Key': getApiKey() };
}

/**
 * Typed fetch wrapper for dashboard API calls.
 * Automatically adds auth headers and handles JSON parsing.
 */
export async function apiFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const { method = 'GET', body, headers: extraHeaders } = options;

  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...extraHeaders,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    let message = `API error (${res.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.error || message;
    } catch {
      // ignore parse failure
    }
    throw new Error(message);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json();
}
