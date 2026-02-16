'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Edit,
  Trash2,
  Zap,
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/hooks';
import type { Automation, AutomationTriggerType, AutomationActionType, AutomationLog } from '@/lib/types';

// --- Human-readable labels ---

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  task_completed: 'Task Completed',
  stage_completed: 'Stage Completed',
  project_created: 'Project Created',
  file_uploaded: 'File Uploaded',
  signature_signed: 'Signature Signed',
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  activate_task: 'Activate Task',
  complete_task: 'Complete Task',
  activate_stage: 'Activate Stage',
  complete_stage: 'Complete Stage',
  send_email: 'Send Email',
  update_project_status: 'Update Project Status',
};

const TRIGGER_TYPES = Object.keys(TRIGGER_LABELS) as AutomationTriggerType[];
const ACTION_TYPES = Object.keys(ACTION_LABELS) as AutomationActionType[];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// --- Types ---

interface EnrichedLog extends AutomationLog {
  project_name: string;
  automation_name: string;
}

interface AutomationFormData {
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  delay_minutes: number;
}

const DEFAULT_FORM: AutomationFormData = {
  name: '',
  trigger_type: 'task_completed',
  trigger_config: {},
  action_type: 'activate_task',
  action_config: {},
  delay_minutes: 0,
};

// --- Page ---

export default function AutomationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: templateId } = use(params);

  const [templateName, setTemplateName] = useState('');
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<EnrichedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('automations');

  const loadAutomations = useCallback(async () => {
    try {
      const [templateData, automationsData] = await Promise.all([
        apiFetch<{ name: string }>(`/api/templates/${templateId}`),
        apiFetch<Automation[]>(`/api/templates/${templateId}/automations`),
      ]);
      setTemplateName(templateData.name);
      setAutomations(automationsData);
    } catch (err) {
      console.error('Failed to load automations:', err);
      toast.error('Failed to load automations');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const logsData = await apiFetch<EnrichedLog[]>(
        `/api/templates/${templateId}/automations/log?limit=50`,
      );
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load logs:', err);
      toast.error('Failed to load execution logs');
    } finally {
      setLogsLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab, loadLogs]);

  async function toggleActive(automation: Automation) {
    try {
      const updated = await apiFetch<Automation>(
        `/api/templates/${templateId}/automations/${automation.id}`,
        { method: 'PATCH', body: { is_active: !automation.is_active } },
      );
      setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(updated.is_active ? 'Automation enabled' : 'Automation disabled');
    } catch (err) {
      toast.error('Failed to toggle automation');
    }
  }

  async function deleteAutomation(automation: Automation) {
    if (!confirm(`Delete automation "${automation.name}"?`)) return;

    try {
      await apiFetch(`/api/templates/${templateId}/automations/${automation.id}`, {
        method: 'DELETE',
      });
      setAutomations((prev) => prev.filter((a) => a.id !== automation.id));
      toast.success('Automation deleted');
    } catch (err) {
      toast.error('Failed to delete automation');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/templates/${templateId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
            <p className="text-sm text-gray-500">{templateName}</p>
          </div>
        </div>
        <AutomationDialog
          templateId={templateId}
          onSaved={(created) => {
            setAutomations((prev) => [...prev, created]);
            toast.success('Automation created');
          }}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="automations" className="gap-2">
            <Zap className="h-4 w-4" />
            Automations ({automations.length})
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ScrollText className="h-4 w-4" />
            Execution Log
          </TabsTrigger>
        </TabsList>

        {/* Automations Tab */}
        <TabsContent value="automations" className="space-y-4">
          {automations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Zap className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No automations yet</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                  Automations let you trigger actions automatically when events happen during onboarding,
                  like activating the next task when one is completed.
                </p>
                <AutomationDialog
                  templateId={templateId}
                  onSaved={(created) => {
                    setAutomations((prev) => [...prev, created]);
                    toast.success('Automation created');
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            automations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                templateId={templateId}
                onToggle={() => toggleActive(automation)}
                onDelete={() => deleteAutomation(automation)}
                onUpdated={(updated) =>
                  setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
                }
              />
            ))
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          {logsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ScrollText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No execution logs yet</h3>
                <p className="text-sm text-gray-500">
                  Logs will appear here after automations are triggered by project events.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {logs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Automation Card ---

function AutomationCard({
  automation,
  templateId,
  onToggle,
  onDelete,
  onUpdated,
}: {
  automation: Automation;
  templateId: string;
  onToggle: () => void;
  onDelete: () => void;
  onUpdated: (updated: Automation) => void;
}) {
  const triggerDescription = describeTrigger(automation);
  const actionDescription = describeAction(automation);

  return (
    <Card className={!automation.is_active ? 'opacity-60' : ''}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left side: name + descriptions */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <Zap className="h-4 w-4 text-[#00c9e3] flex-shrink-0" />
              <h3 className="font-medium text-gray-900 truncate">{automation.name}</h3>
              {!automation.is_active && (
                <Badge variant="outline" className="text-xs text-gray-400">
                  Disabled
                </Badge>
              )}
            </div>

            {/* Trigger -> Action flow */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-blue-700 font-medium">
                When {triggerDescription}
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2.5 py-1 text-green-700 font-medium">
                Then {actionDescription}
              </span>
            </div>

            {/* Delay */}
            {automation.delay_minutes > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5" />
                Delayed by {automation.delay_minutes} minute{automation.delay_minutes !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Right side: controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Switch
              checked={automation.is_active}
              onCheckedChange={onToggle}
              aria-label="Toggle automation"
            />
            <AutomationDialog
              templateId={templateId}
              automation={automation}
              onSaved={onUpdated}
              trigger={
                <Button variant="ghost" size="sm">
                  <Edit className="h-4 w-4" />
                </Button>
              }
            />
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Log Row ---

function LogRow({ log }: { log: EnrichedLog }) {
  const statusIcon =
    log.status === 'success' ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : log.status === 'failed' ? (
      <XCircle className="h-4 w-4 text-red-500" />
    ) : (
      <AlertCircle className="h-4 w-4 text-yellow-500" />
    );

  const statusColor =
    log.status === 'success'
      ? 'bg-green-50 text-green-700 border-green-200'
      : log.status === 'failed'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-yellow-50 text-yellow-700 border-yellow-200';

  const date = new Date(log.executed_at);
  const timeStr = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
      {statusIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{log.automation_name}</span>
          <Badge variant="outline" className={`text-xs border ${statusColor}`}>
            {log.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">Project: {log.project_name}</span>
          {log.trigger_event?.type != null && (
            <span className="text-xs text-gray-400">
              | Trigger: {TRIGGER_LABELS[String(log.trigger_event.type) as AutomationTriggerType] || String(log.trigger_event.type)}
            </span>
          )}
        </div>
        {log.error_message && (
          <p className="text-xs text-red-600 mt-1 truncate">{log.error_message}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">{timeStr}</span>
    </div>
  );
}

// --- Automation Dialog (Add / Edit) ---

function AutomationDialog({
  templateId,
  automation,
  onSaved,
  trigger,
}: {
  templateId: string;
  automation?: Automation;
  onSaved: (automation: Automation) => void;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!automation;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AutomationFormData>(DEFAULT_FORM);

  useEffect(() => {
    if (open && automation) {
      setForm({
        name: automation.name,
        trigger_type: automation.trigger_type,
        trigger_config: automation.trigger_config,
        action_type: automation.action_type,
        action_config: automation.action_config,
        delay_minutes: automation.delay_minutes,
      });
    } else if (open && !automation) {
      setForm(DEFAULT_FORM);
    }
  }, [open, automation]);

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        const updated = await apiFetch<Automation>(
          `/api/templates/${templateId}/automations/${automation.id}`,
          {
            method: 'PATCH',
            body: {
              name: form.name.trim(),
              trigger_type: form.trigger_type,
              trigger_config: form.trigger_config,
              action_type: form.action_type,
              action_config: form.action_config,
              delay_minutes: form.delay_minutes,
            },
          },
        );
        onSaved(updated);
        toast.success('Automation updated');
      } else {
        const created = await apiFetch<Automation>(
          `/api/templates/${templateId}/automations`,
          {
            method: 'POST',
            body: {
              name: form.name.trim(),
              trigger_type: form.trigger_type,
              trigger_config: form.trigger_config,
              action_type: form.action_type,
              action_config: form.action_config,
              delay_minutes: form.delay_minutes,
            },
          },
        );
        onSaved(created);
      }
      setOpen(false);
    } catch (err) {
      toast.error(isEdit ? 'Failed to update automation' : 'Failed to create automation');
    } finally {
      setSubmitting(false);
    }
  }

  function updateTriggerConfig(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      trigger_config: value ? { ...prev.trigger_config, [key]: value } : removeKey(prev.trigger_config, key),
    }));
  }

  function updateActionConfig(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      action_config: value ? { ...prev.action_config, [key]: value } : removeKey(prev.action_config, key),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-[#00c9e3] hover:bg-[#00b3cc] text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Automation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Automation' : 'Add Automation'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div>
            <Label htmlFor="auto-name">Name</Label>
            <Input
              id="auto-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Activate Phase 2 when Phase 1 completes"
            />
          </div>

          {/* Trigger */}
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-2 text-sm font-medium text-blue-700">When (Trigger)</legend>

            <div>
              <Label htmlFor="trigger-type">Event Type</Label>
              <Select
                value={form.trigger_type}
                onValueChange={(v) => {
                  setForm({ ...form, trigger_type: v as AutomationTriggerType, trigger_config: {} });
                }}
              >
                <SelectTrigger id="trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic trigger config fields */}
            <TriggerConfigFields
              triggerType={form.trigger_type}
              config={form.trigger_config}
              onChange={updateTriggerConfig}
            />
          </fieldset>

          {/* Action */}
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-2 text-sm font-medium text-green-700">Then (Action)</legend>

            <div>
              <Label htmlFor="action-type">Action Type</Label>
              <Select
                value={form.action_type}
                onValueChange={(v) => {
                  setForm({ ...form, action_type: v as AutomationActionType, action_config: {} });
                }}
              >
                <SelectTrigger id="action-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic action config fields */}
            <ActionConfigFields
              actionType={form.action_type}
              config={form.action_config}
              onChange={updateActionConfig}
            />
          </fieldset>

          {/* Delay */}
          <div>
            <Label htmlFor="delay">Delay (minutes)</Label>
            <Input
              id="delay"
              type="number"
              min={0}
              value={form.delay_minutes}
              onChange={(e) => setForm({ ...form, delay_minutes: parseInt(e.target.value) || 0 })}
              placeholder="0"
            />
            <p className="text-xs text-gray-500 mt-1">
              Set to 0 for immediate execution. Delayed automations require a cron job.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={!form.name.trim() || submitting}
            className="bg-[#00c9e3] hover:bg-[#00b3cc] text-white"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isEdit ? (
              'Save Changes'
            ) : (
              'Create Automation'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Dynamic Config Field Components ---

function TriggerConfigFields({
  triggerType,
  config,
  onChange,
}: {
  triggerType: AutomationTriggerType;
  config: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  switch (triggerType) {
    case 'task_completed':
      return (
        <div>
          <Label htmlFor="tc-task-title">Task Title (optional)</Label>
          <Input
            id="tc-task-title"
            value={(config.task_title as string) || ''}
            onChange={(e) => onChange('task_title', e.target.value)}
            placeholder="Leave blank for any task"
          />
          <p className="text-xs text-gray-500 mt-1">
            Match a specific task by exact title, or leave empty to match any completed task.
          </p>
        </div>
      );

    case 'stage_completed':
      return (
        <div>
          <Label htmlFor="tc-stage-name">Stage Name (optional)</Label>
          <Input
            id="tc-stage-name"
            value={(config.stage_name as string) || ''}
            onChange={(e) => onChange('stage_name', e.target.value)}
            placeholder="Leave blank for any stage"
          />
        </div>
      );

    case 'file_uploaded':
      return (
        <div>
          <Label htmlFor="tc-file-task">Associated Task Title (optional)</Label>
          <Input
            id="tc-file-task"
            value={(config.task_title as string) || ''}
            onChange={(e) => onChange('task_title', e.target.value)}
            placeholder="Leave blank for any file upload"
          />
        </div>
      );

    case 'project_created':
    case 'signature_signed':
      return (
        <p className="text-xs text-gray-500 italic">
          No additional configuration needed for this trigger type.
        </p>
      );

    default:
      return null;
  }
}

function ActionConfigFields({
  actionType,
  config,
  onChange,
}: {
  actionType: AutomationActionType;
  config: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  switch (actionType) {
    case 'activate_task':
    case 'complete_task':
      return (
        <div>
          <Label htmlFor="ac-task-title">Task Title</Label>
          <Input
            id="ac-task-title"
            value={(config.task_title as string) || ''}
            onChange={(e) => onChange('task_title', e.target.value)}
            placeholder="Exact title of the task to target"
          />
          <p className="text-xs text-gray-500 mt-1">
            Must match the exact task title in the template.
          </p>
        </div>
      );

    case 'activate_stage':
    case 'complete_stage':
      return (
        <div>
          <Label htmlFor="ac-stage-name">Stage Name</Label>
          <Input
            id="ac-stage-name"
            value={(config.stage_name as string) || ''}
            onChange={(e) => onChange('stage_name', e.target.value)}
            placeholder="Exact name of the stage to target"
          />
        </div>
      );

    case 'send_email':
      return (
        <div className="space-y-3">
          <div>
            <Label htmlFor="ac-recipient">Recipient</Label>
            <Select
              value={(config.recipient_type as string) || 'staff'}
              onValueChange={(v) => onChange('recipient_type', v)}
            >
              <SelectTrigger id="ac-recipient">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ac-subject">Email Subject</Label>
            <Input
              id="ac-subject"
              value={(config.subject as string) || ''}
              onChange={(e) => onChange('subject', e.target.value)}
              placeholder="Notification subject line"
            />
          </div>
          <div>
            <Label htmlFor="ac-message">Email Message</Label>
            <Input
              id="ac-message"
              value={(config.message as string) || ''}
              onChange={(e) => onChange('message', e.target.value)}
              placeholder="Email body text"
            />
          </div>
        </div>
      );

    case 'update_project_status':
      return (
        <div>
          <Label htmlFor="ac-status">New Status</Label>
          <Select
            value={(config.status as string) || ''}
            onValueChange={(v) => onChange('status', v)}
          >
            <SelectTrigger id="ac-status">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    default:
      return null;
  }
}

// --- Helpers ---

function describeTrigger(automation: Automation): string {
  const label = TRIGGER_LABELS[automation.trigger_type] || automation.trigger_type;
  const config = automation.trigger_config;

  if (config.task_title) return `"${config.task_title}" is completed`;
  if (config.stage_name) return `stage "${config.stage_name}" is completed`;
  if (config.task_category) return `any ${config.task_category} task is completed`;

  return label.toLowerCase();
}

function describeAction(automation: Automation): string {
  const label = ACTION_LABELS[automation.action_type] || automation.action_type;
  const config = automation.action_config;

  if (config.task_title) return `${label.toLowerCase()} "${config.task_title}"`;
  if (config.stage_name) return `${label.toLowerCase()} "${config.stage_name}"`;
  if (config.status) return `set project status to "${config.status}"`;
  if (config.recipient_type) return `send email to ${config.recipient_type}`;

  return label.toLowerCase();
}

function removeKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _, ...rest } = obj;
  return rest;
}
