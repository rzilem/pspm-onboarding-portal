import { supabaseRest } from './supabase';

/**
 * Log an activity event for a project.
 * Fire-and-forget — errors are swallowed to avoid blocking the main flow.
 */
export async function logActivity(params: {
  project_id: string;
  task_id?: string;
  actor: string;
  actor_type: 'staff' | 'client' | 'system';
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseRest('onboarding_activity_log', {
      method: 'POST',
      body: JSON.stringify({
        project_id: params.project_id,
        task_id: params.task_id || null,
        actor: params.actor,
        actor_type: params.actor_type,
        action: params.action,
        details: params.details || null,
      }),
      prefer: 'return=minimal',
    });
  } catch (err) {
    console.error('[activity-log] Failed to log activity:', err);
  }
}
