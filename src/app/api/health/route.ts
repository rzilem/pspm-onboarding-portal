import { NextResponse } from 'next/server';

export async function GET() {
  const healthy = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

  return NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    service: 'pspm-onboarding-portal',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks: {
      supabase: !!process.env.SUPABASE_URL,
      auth: !!process.env.NEXTAUTH_SECRET,
      admin_key: !!process.env.ADMIN_API_KEY,
      crm_key: !!process.env.CRM_API_KEY,
    },
  }, { status: healthy ? 200 : 503 });
}
