/**
 * Supabase REST API helper for PSPM Onboarding Portal
 * Uses service_role key for server-side operations
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export interface SupabaseRequestInit {
  method?: string;
  body?: string;
  prefer?: string;
  timeout?: number;
  useServiceRole?: boolean;
}

export async function supabaseRest<T>(
  path: string,
  opts: SupabaseRequestInit = {},
): Promise<T> {
  if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL');
  }

  const key = opts.useServiceRole !== false ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('Missing Supabase key');
  }

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (opts.prefer) {
    headers['Prefer'] = opts.prefer;
  }

  const timeout = opts.timeout ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Supabase ${opts.method || 'GET'} ${path} timed out after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${opts.method || 'GET'} ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return [] as unknown as T;

  return res.json();
}

/** Supabase Storage upload helper */
export async function supabaseStorageUpload(
  bucket: string,
  path: string,
  file: Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<{ path: string }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase credentials');
  }

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: file as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${text}`);
  }

  return { path: `${bucket}/${path}` };
}

/** Supabase Storage download helper */
export async function supabaseStorageDownload(
  bucket: string,
  path: string,
): Promise<ArrayBuffer> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase credentials');
  }

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage download failed (${res.status}): ${text}`);
  }

  return res.arrayBuffer();
}

/** Get public URL for a storage object */
export function supabaseStoragePublicUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
