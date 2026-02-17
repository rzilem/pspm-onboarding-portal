/**
 * Auto-stage completion utility.
 * When all tasks in a stage are completed/skipped, auto-complete the stage and activate the next one.
 */

import { supabaseRest } from './supabase';
import { evaluateAutomations } from './automation-engine';
import type { Task, Stage } from './types';

/**
 * Check if completing this task causes its stage to auto-complete.
 * If all tasks in the stage are completed/skipped:
 * 1. Mark the stage as 'completed'
 * 2. Fire stage_completed automation
 * 3. Activate the next pending stage
 */
export async function checkAndAdvanceStages(
  projectId: string,
  taskId: string,
): Promise<void> {
  try {
    // Fetch the task to get its stage_id
    const tasks = await supabaseRest<Task[]>(
      `onboarding_tasks?id=eq.${encodeURIComponent(taskId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,stage_id,status&limit=1`,
    );

    if (!tasks.length || !tasks[0].stage_id) return;

    const stageId = tasks[0].stage_id;

    // Fetch all tasks in this stage
    const stageTasks = await supabaseRest<Task[]>(
      `onboarding_tasks?project_id=eq.${encodeURIComponent(projectId)}&stage_id=eq.${encodeURIComponent(stageId)}&select=id,status`,
    );

    // Check if ALL tasks are completed or skipped
    const allDone = stageTasks.every(
      (t) => t.status === 'completed' || t.status === 'skipped',
    );

    if (!allDone) return;

    // Mark stage as completed
    await supabaseRest(
      `onboarding_stages?id=eq.${encodeURIComponent(stageId)}&project_id=eq.${encodeURIComponent(projectId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', updated_at: new Date().toISOString() }),
        prefer: 'return=minimal',
      },
    );

    // Fire stage_completed automation
    evaluateAutomations(projectId, { type: 'stage_completed', stage_id: stageId }).catch(console.error);

    // Activate next pending stage
    const stages = await supabaseRest<Stage[]>(
      `onboarding_stages?project_id=eq.${encodeURIComponent(projectId)}&status=eq.pending&order=order_index.asc&limit=1`,
    );

    if (stages.length > 0) {
      await supabaseRest(
        `onboarding_stages?id=eq.${encodeURIComponent(stages[0].id)}&project_id=eq.${encodeURIComponent(projectId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active', updated_at: new Date().toISOString() }),
          prefer: 'return=minimal',
        },
      );
    }
  } catch (err) {
    console.error('[stage-utils] checkAndAdvanceStages error:', err);
  }
}
