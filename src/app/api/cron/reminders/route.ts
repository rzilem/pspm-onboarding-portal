import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';
import { sendTaskReminder } from '@/lib/email';
import type { Project, Task } from '@/lib/types';

const CRON_SECRET = process.env.CRON_SECRET || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/**
 * POST /api/cron/reminders — Daily task reminder cron job
 *
 * Auth: Either X-API-Key header or X-Cron-Secret header
 *
 * Finds all active projects with pending external tasks that are:
 * - Due within 3 days OR overdue
 * - Have a client contact email
 *
 * Groups tasks by project and sends one reminder email per client.
 */
export async function POST(req: NextRequest) {
  // Validate auth (cron secret or API key)
  const cronSecret = req.headers.get('x-cron-secret');
  const apiKey = req.headers.get('x-api-key');

  if (!cronSecret && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (cronSecret && CRON_SECRET && cronSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid cron secret' }, { status: 401 });
  }

  if (apiKey && ADMIN_API_KEY && apiKey !== ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  try {
    // Get all active projects with client emails
    const projects = await supabaseRest<Project[]>(
      'onboarding_projects?status=eq.active&client_contact_email=not.is.null&select=*',
    );

    if (!projects.length) {
      return NextResponse.json({ message: 'No active projects with client emails', sent: 0 });
    }

    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysISO = threeDaysFromNow.toISOString().split('T')[0];

    const projectIds = projects.map((p) => p.id);

    // Get all external pending tasks with due dates within 3 days or overdue
    const allTasks = await supabaseRest<Task[]>(
      `onboarding_tasks?project_id=in.(${projectIds.join(',')})&visibility=eq.external&status=eq.pending&due_date=not.is.null&due_date=lte.${threeDaysISO}&select=*&order=due_date.asc`,
    );

    // Group tasks by project
    const tasksByProject = new Map<string, Task[]>();
    for (const task of allTasks) {
      const existing = tasksByProject.get(task.project_id) || [];
      tasksByProject.set(task.project_id, [...existing, task]);
    }

    // Send reminder emails
    const results = [];
    for (const project of projects) {
      const tasks = tasksByProject.get(project.id);
      if (!tasks || tasks.length === 0) continue;

      const pendingTasks = tasks.map((t) => ({
        title: t.title,
        due_date: t.due_date || undefined,
      }));

      const result = await sendTaskReminder({
        to: project.client_contact_email!,
        clientName: project.client_contact_name || 'there',
        projectName: project.name,
        pendingTasks,
        portalToken: project.public_token,
        project_id: project.id,
      });

      results.push({
        project_id: project.id,
        project_name: project.name,
        client_email: project.client_contact_email,
        task_count: tasks.length,
        sent: !!result,
        email_id: result?.id || null,
      });
    }

    const sentCount = results.filter((r) => r.sent).length;

    return NextResponse.json({
      message: `Sent ${sentCount} reminder emails`,
      sent: sentCount,
      total_projects: projects.length,
      projects_with_pending_tasks: results.length,
      results,
    });
  } catch (err) {
    console.error('[api/cron/reminders] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
