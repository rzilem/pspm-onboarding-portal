/**
 * Automation Engine for PSPM Onboarding Portal.
 * Evaluates and executes automations when trigger events occur.
 * All actions are fire-and-forget — errors are logged, not thrown.
 */

import { supabaseRest } from './supabase';
import { sendStaffNotification, sendClientInvite, sendTaskReminder } from './email';
import type {
  Automation,
  AutomationTriggerType,
  Project,
  Task,
  Stage,
} from './types';

interface TriggerEvent {
  type: AutomationTriggerType;
  task_id?: string;
  stage_id?: string;
  file_id?: string;
  signature_id?: string;
}

/**
 * Evaluate and execute automations for a project when an event occurs.
 * 1. Looks up the project to get its template_id
 * 2. Finds matching active automations for the template and trigger type
 * 3. Checks trigger_config match (e.g., specific task title or "any")
 * 4. Executes each matching automation's action
 * 5. Logs results to onboarding_automation_log
 */
export async function evaluateAutomations(
  projectId: string,
  event: TriggerEvent,
): Promise<void> {
  try {
    // 1. Look up the project to get template_id
    const projects = await supabaseRest<Project[]>(
      `onboarding_projects?id=eq.${encodeURIComponent(projectId)}&select=id,template_id,name,client_contact_email,client_contact_name,community_name,assigned_staff_email,public_token,status&limit=1`,
    );

    if (!projects.length) {
      console.warn(`[automation-engine] Project ${projectId} not found`);
      return;
    }

    const project = projects[0];

    if (!project.template_id) {
      // No template — no automations to evaluate
      return;
    }

    // 2. Query active automations for this template and trigger type
    const automations = await supabaseRest<Automation[]>(
      `onboarding_automations?template_id=eq.${encodeURIComponent(project.template_id)}&is_active=eq.true&trigger_type=eq.${encodeURIComponent(event.type)}&order=order_index`,
    );

    if (!automations.length) return;

    // 3. Fetch contextual data needed for matching and actions
    const contextData = await fetchContextData(projectId, event);

    // 4. Process each automation
    for (const automation of automations) {
      try {
        // Skip delayed automations (handled by cron)
        if (automation.delay_minutes > 0) {
          await logAutomationExecution(automation.id, projectId, event, {
            skipped: true,
            reason: `Delayed by ${automation.delay_minutes} minutes`,
          }, 'skipped');
          continue;
        }

        // Check if trigger_config matches
        const matches = checkTriggerMatch(automation, event, contextData);
        if (!matches) {
          continue; // Silently skip non-matching automations
        }

        // Execute the action
        const result = await executeAction(automation, project, contextData);

        // Log success
        await logAutomationExecution(automation.id, projectId, event, result, 'success');
      } catch (err) {
        // Log failure but don't block other automations
        console.error(`[automation-engine] Automation ${automation.id} (${automation.name}) failed:`, err);
        await logAutomationExecution(
          automation.id,
          projectId,
          event,
          null,
          'failed',
          err instanceof Error ? err.message : 'Unknown error',
        );
      }
    }
  } catch (err) {
    console.error('[automation-engine] evaluateAutomations failed:', err);
  }
}

// --- Context data for matching and action execution ---

interface ContextData {
  task?: Task;
  stage?: Stage;
  tasks: Task[];
  stages: Stage[];
}

async function fetchContextData(
  projectId: string,
  event: TriggerEvent,
): Promise<ContextData> {
  const [tasks, stages] = await Promise.all([
    supabaseRest<Task[]>(
      `onboarding_tasks?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=order_index`,
    ),
    supabaseRest<Stage[]>(
      `onboarding_stages?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=order_index`,
    ),
  ]);

  const context: ContextData = { tasks, stages };

  if (event.task_id) {
    context.task = tasks.find((t) => t.id === event.task_id);
  }

  if (event.stage_id) {
    context.stage = stages.find((s) => s.id === event.stage_id);
  }

  return context;
}

// --- Trigger matching ---

function checkTriggerMatch(
  automation: Automation,
  event: TriggerEvent,
  context: ContextData,
): boolean {
  const config = automation.trigger_config;

  // Empty config means "match any event of this type"
  if (!config || Object.keys(config).length === 0) {
    return true;
  }

  switch (event.type) {
    case 'task_completed': {
      // Match by task title if specified
      if (config.task_title && context.task) {
        return context.task.title === config.task_title;
      }
      // Match by task category if specified
      if (config.task_category && context.task) {
        return context.task.category === config.task_category;
      }
      return true;
    }

    case 'stage_completed': {
      // Match by stage name if specified
      if (config.stage_name && context.stage) {
        return context.stage.name === config.stage_name;
      }
      return true;
    }

    case 'project_created':
      // Always matches — project_created has no further config
      return true;

    case 'file_uploaded': {
      // Match by task title (the task the file is associated with)
      if (config.task_title && context.task) {
        return context.task.title === config.task_title;
      }
      return true;
    }

    case 'signature_signed':
      // Always matches for now
      return true;

    default:
      return false;
  }
}

// --- Action execution ---

async function executeAction(
  automation: Automation,
  project: Project,
  context: ContextData,
): Promise<Record<string, unknown>> {
  const config = automation.action_config;

  switch (automation.action_type) {
    case 'activate_task':
      return activateTask(project.id, config, context);

    case 'complete_task':
      return completeTask(project.id, config, context);

    case 'activate_stage':
      return activateStage(project.id, config, context);

    case 'complete_stage':
      return completeStage(project.id, config, context);

    case 'send_email':
      return sendAutomationEmail(project, config);

    case 'update_project_status':
      return updateProjectStatus(project.id, config);

    default:
      throw new Error(`Unknown action_type: ${automation.action_type}`);
  }
}

async function activateTask(
  projectId: string,
  config: Record<string, unknown>,
  context: ContextData,
): Promise<Record<string, unknown>> {
  const taskTitle = config.task_title as string | undefined;
  if (!taskTitle) throw new Error('action_config.task_title is required for activate_task');

  const task = context.tasks.find((t) => t.title === taskTitle);
  if (!task) throw new Error(`Task "${taskTitle}" not found in project`);

  if (task.status === 'completed' || task.status === 'in_progress') {
    return { skipped: true, reason: `Task already ${task.status}`, task_id: task.id };
  }

  await supabaseRest(
    `onboarding_tasks?id=eq.${encodeURIComponent(task.id)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_progress', updated_at: new Date().toISOString() }),
      prefer: 'return=minimal',
    },
  );

  return { action: 'activate_task', task_id: task.id, task_title: taskTitle };
}

async function completeTask(
  projectId: string,
  config: Record<string, unknown>,
  context: ContextData,
): Promise<Record<string, unknown>> {
  const taskTitle = config.task_title as string | undefined;
  if (!taskTitle) throw new Error('action_config.task_title is required for complete_task');

  const task = context.tasks.find((t) => t.title === taskTitle);
  if (!task) throw new Error(`Task "${taskTitle}" not found in project`);

  if (task.status === 'completed') {
    return { skipped: true, reason: 'Task already completed', task_id: task.id };
  }

  const now = new Date().toISOString();
  await supabaseRest(
    `onboarding_tasks?id=eq.${encodeURIComponent(task.id)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'completed',
        completed_at: now,
        completed_by: 'automation',
        updated_at: now,
      }),
      prefer: 'return=minimal',
    },
  );

  return { action: 'complete_task', task_id: task.id, task_title: taskTitle };
}

async function activateStage(
  projectId: string,
  config: Record<string, unknown>,
  context: ContextData,
): Promise<Record<string, unknown>> {
  const stageName = config.stage_name as string | undefined;
  if (!stageName) throw new Error('action_config.stage_name is required for activate_stage');

  const stage = context.stages.find((s) => s.name === stageName);
  if (!stage) throw new Error(`Stage "${stageName}" not found in project`);

  if (stage.status === 'active' || stage.status === 'completed') {
    return { skipped: true, reason: `Stage already ${stage.status}`, stage_id: stage.id };
  }

  await supabaseRest(
    `onboarding_stages?id=eq.${encodeURIComponent(stage.id)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', updated_at: new Date().toISOString() }),
      prefer: 'return=minimal',
    },
  );

  return { action: 'activate_stage', stage_id: stage.id, stage_name: stageName };
}

async function completeStage(
  projectId: string,
  config: Record<string, unknown>,
  context: ContextData,
): Promise<Record<string, unknown>> {
  const stageName = config.stage_name as string | undefined;
  if (!stageName) throw new Error('action_config.stage_name is required for complete_stage');

  const stage = context.stages.find((s) => s.name === stageName);
  if (!stage) throw new Error(`Stage "${stageName}" not found in project`);

  if (stage.status === 'completed') {
    return { skipped: true, reason: 'Stage already completed', stage_id: stage.id };
  }

  await supabaseRest(
    `onboarding_stages?id=eq.${encodeURIComponent(stage.id)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', updated_at: new Date().toISOString() }),
      prefer: 'return=minimal',
    },
  );

  return { action: 'complete_stage', stage_id: stage.id, stage_name: stageName };
}

async function sendAutomationEmail(
  project: Project,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const templateType = (config.template_type as string) || 'staff_notification';
  const recipientType = (config.recipient_type as string) || 'staff';

  let toEmail: string | null = null;
  let recipientName: string | null = null;

  if (recipientType === 'client') {
    toEmail = project.client_contact_email;
    recipientName = project.client_contact_name;
  } else {
    // Staff — send to assigned staff
    toEmail = project.assigned_staff_email;
  }

  if (!toEmail) {
    return { skipped: true, reason: `No email address for ${recipientType}` };
  }

  const subject = (config.subject as string) || `Automation: ${project.name}`;
  const message = (config.message as string) || `An automation was triggered for project "${project.name}".`;

  const result = await sendStaffNotification({
    to: toEmail,
    staffName: recipientName || undefined,
    projectName: project.name,
    action: subject,
    details: message,
    project_id: project.id,
  });

  return {
    action: 'send_email',
    recipient_type: recipientType,
    to: toEmail,
    template_type: templateType,
    email_id: result?.id || null,
  };
}

async function updateProjectStatus(
  projectId: string,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const status = config.status as string | undefined;
  if (!status) throw new Error('action_config.status is required for update_project_status');

  const validStatuses = ['draft', 'active', 'paused', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`);
  }

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  } else if (status === 'active') {
    updates.started_at = new Date().toISOString();
  }

  await supabaseRest(
    `onboarding_projects?id=eq.${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
      prefer: 'return=minimal',
    },
  );

  return { action: 'update_project_status', new_status: status };
}

// --- Logging ---

async function logAutomationExecution(
  automationId: string,
  projectId: string,
  triggerEvent: TriggerEvent,
  actionResult: Record<string, unknown> | null,
  status: 'success' | 'failed' | 'skipped',
  errorMessage?: string,
): Promise<void> {
  try {
    await supabaseRest('onboarding_automation_log', {
      method: 'POST',
      body: JSON.stringify({
        automation_id: automationId,
        project_id: projectId,
        trigger_event: triggerEvent,
        action_result: actionResult,
        status,
        error_message: errorMessage || null,
      }),
      prefer: 'return=minimal',
    });
  } catch (err) {
    console.error('[automation-engine] Failed to log execution:', err);
  }
}
