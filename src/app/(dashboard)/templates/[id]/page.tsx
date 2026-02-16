'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  FileUp,
  PenLine,
  Plus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Edit,
  Trash2,
  Copy,
  Check,
  X,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/hooks';
import { categoryLabel } from '@/lib/utils';
import type { Template, TemplateTask, Stage, TaskCategory } from '@/lib/types';

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: templateId } = use(params);
  const router = useRouter();

  const [template, setTemplate] = useState<Template | null>(null);
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');

  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

  async function loadAll() {
    try {
      const [templateData, stagesData] = await Promise.all([
        apiFetch<Template & { tasks: TemplateTask[] }>(`/api/templates/${templateId}`),
        apiFetch<Stage[]>(`/api/templates/${templateId}/stages`),
      ]);

      setTemplate(templateData);
      setTasks(templateData.tasks || []);
      setStages(stagesData);
      setNameInput(templateData.name);
      setDescriptionInput(templateData.description || '');
    } catch (err) {
      console.error('Failed to load template:', err);
      toast.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [templateId]);

  async function saveName() {
    if (!nameInput.trim() || !template) return;

    try {
      await apiFetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: { name: nameInput.trim() },
      });
      setTemplate({ ...template, name: nameInput.trim() });
      setEditingName(false);
      toast.success('Template name updated');
    } catch (err) {
      toast.error('Failed to update name');
    }
  }

  async function saveDescription() {
    if (!template) return;

    try {
      await apiFetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: { description: descriptionInput.trim() || null },
      });
      setTemplate({ ...template, description: descriptionInput.trim() || null });
      setEditingDescription(false);
      toast.success('Description updated');
    } catch (err) {
      toast.error('Failed to update description');
    }
  }

  async function toggleActive() {
    if (!template) return;

    try {
      await apiFetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: { is_active: !template.is_active },
      });
      setTemplate({ ...template, is_active: !template.is_active });
      toast.success(template.is_active ? 'Template deactivated' : 'Template activated');
    } catch (err) {
      toast.error('Failed to toggle status');
    }
  }

  async function handleDuplicate() {
    if (!template) return;

    try {
      const duplicated = await apiFetch<Template>(
        `/api/templates?duplicate=true&source_id=${templateId}`,
        { method: 'POST' },
      );
      toast.success('Template duplicated');
      router.push(`/templates/${duplicated.id}`);
    } catch (err) {
      toast.error('Failed to duplicate template');
    }
  }

  async function addStage() {
    const name = prompt('Stage name:');
    if (!name?.trim()) return;

    try {
      const created = await apiFetch<Stage>(`/api/templates/${templateId}/stages`, {
        method: 'POST',
        body: { name: name.trim(), order_index: stages.length },
      });
      setStages([...stages, created]);
      toast.success('Stage added');
    } catch (err) {
      toast.error('Failed to add stage');
    }
  }

  async function editStage(stage: Stage) {
    const newName = prompt('Stage name:', stage.name);
    if (!newName?.trim() || newName.trim() === stage.name) return;

    try {
      await apiFetch(`/api/templates/${templateId}/stages/${stage.id}`, {
        method: 'PATCH',
        body: { name: newName.trim() },
      });
      setStages(stages.map((s) => (s.id === stage.id ? { ...s, name: newName.trim() } : s)));
      toast.success('Stage updated');
    } catch (err) {
      toast.error('Failed to update stage');
    }
  }

  async function deleteStage(stage: Stage) {
    if (!confirm(`Delete stage "${stage.name}"? Tasks in this stage will become unsorted.`)) return;

    try {
      await apiFetch(`/api/templates/${templateId}/stages/${stage.id}`, { method: 'DELETE' });
      setStages(stages.filter((s) => s.id !== stage.id));
      setTasks(tasks.map((t) => (t.stage_id === stage.id ? { ...t, stage_id: null } : t)));
      toast.success('Stage deleted');
    } catch (err) {
      toast.error('Failed to delete stage');
    }
  }

  async function moveStage(stage: Stage, direction: 'up' | 'down') {
    const idx = stages.findIndex((s) => s.id === stage.id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === stages.length - 1)) return;

    const newIndex = direction === 'up' ? idx - 1 : idx + 1;
    const reordered = [...stages];
    [reordered[idx], reordered[newIndex]] = [reordered[newIndex], reordered[idx]];

    const updates = reordered.map((s, i) => ({ id: s.id, order_index: i }));

    try {
      await Promise.all(
        updates.map((u) =>
          apiFetch(`/api/templates/${templateId}/stages/${u.id}`, {
            method: 'PATCH',
            body: { order_index: u.order_index },
          }),
        ),
      );
      setStages(reordered.map((s, i) => ({ ...s, order_index: i })));
    } catch (err) {
      toast.error('Failed to reorder stages');
    }
  }

  async function deleteTask(task: TemplateTask) {
    if (!confirm(`Delete task "${task.title}"?`)) return;

    try {
      await apiFetch(`/api/templates/${templateId}/tasks/${task.id}`, { method: 'DELETE' });
      setTasks(tasks.filter((t) => t.id !== task.id));
      toast.success('Task deleted');
    } catch (err) {
      toast.error('Failed to delete task');
    }
  }

  async function moveTask(task: TemplateTask, direction: 'up' | 'down', stageId: string | null) {
    const stageTasks = tasks.filter((t) => t.stage_id === stageId).sort((a, b) => a.order_index - b.order_index);
    const idx = stageTasks.findIndex((t) => t.id === task.id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === stageTasks.length - 1)) return;

    const newIndex = direction === 'up' ? idx - 1 : idx + 1;
    const reordered = [...stageTasks];
    [reordered[idx], reordered[newIndex]] = [reordered[newIndex], reordered[idx]];

    const updates = reordered.map((t, i) => ({ id: t.id, order_index: i }));

    try {
      await apiFetch(`/api/templates/${templateId}/tasks/reorder`, {
        method: 'PATCH',
        body: { tasks: updates },
      });

      const updatedTasks = tasks.map((t) => {
        const update = updates.find((u) => u.id === t.id);
        return update ? { ...t, order_index: update.order_index } : t;
      });
      setTasks(updatedTasks);
    } catch (err) {
      toast.error('Failed to reorder tasks');
    }
  }

  function toggleStageCollapse(stageId: string) {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Template not found</h2>
        <Link href="/templates" className="text-[#00c9e3] hover:underline mt-2 inline-block">
          Back to templates
        </Link>
      </div>
    );
  }

  const externalTasks = tasks.filter((t) => t.visibility === 'external');
  const internalTasks = tasks.filter((t) => t.visibility === 'internal');

  const renderStageSection = (stageId: string | null, stageName: string) => {
    const stageTasks = tasks
      .filter((t) => t.stage_id === stageId)
      .sort((a, b) => a.order_index - b.order_index);
    const isCollapsed = stageId ? collapsedStages.has(stageId) : false;

    return (
      <div key={stageId || 'unsorted'} className="border rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100"
          onClick={() => stageId && toggleStageCollapse(stageId)}
        >
          <div className="flex items-center gap-2">
            {stageId && (isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
            <h3 className="font-medium text-gray-900">{stageName}</h3>
            <Badge variant="outline" className="text-xs">
              {stageTasks.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {stageId && stages.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const stage = stages.find((s) => s.id === stageId);
                    if (stage) moveStage(stage, 'up');
                  }}
                  disabled={stages.findIndex((s) => s.id === stageId) === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const stage = stages.find((s) => s.id === stageId);
                    if (stage) moveStage(stage, 'down');
                  }}
                  disabled={stages.findIndex((s) => s.id === stageId) === stages.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const stage = stages.find((s) => s.id === stageId);
                    if (stage) editStage(stage);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const stage = stages.find((s) => s.id === stageId);
                    if (stage) deleteStage(stage);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </>
            )}
            <AddTaskDialog templateId={templateId} stageId={stageId} onAdded={(t) => setTasks([...tasks, t])} />
          </div>
        </div>

        {!isCollapsed && (
          <div className="divide-y">
            {stageTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">No tasks in this stage</div>
            ) : (
              stageTasks.map((task, idx) => (
                <div key={task.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                  <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    {task.description && <p className="text-xs text-gray-500 line-clamp-1">{task.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {task.requires_file_upload && <FileUp className="h-3.5 w-3.5 text-gray-400" />}
                    {task.requires_signature && <PenLine className="h-3.5 w-3.5 text-gray-400" />}
                    <Badge variant="outline" className="text-xs">
                      {task.visibility === 'external' ? 'Client' : 'Staff'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {categoryLabel(task.category)}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => moveTask(task, 'up', stageId)} disabled={idx === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveTask(task, 'down', stageId)}
                      disabled={idx === stageTasks.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <EditTaskDialog
                      task={task}
                      stages={stages}
                      allTasks={tasks}
                      onUpdated={(updated) => setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)))}
                      templateId={templateId}
                    />
                    <Button variant="ghost" size="sm" onClick={() => deleteTask(task)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="text-2xl font-bold max-w-lg"
              />
              <Button size="sm" onClick={saveName}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h1
              className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-gray-700"
              onClick={() => setEditingName(true)}
            >
              {template.name}
            </h1>
          )}
          {editingDescription ? (
            <div className="flex items-center gap-2 mt-1">
              <Textarea
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                className="text-sm max-w-2xl"
                rows={2}
              />
              <Button size="sm" onClick={saveDescription}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p
              className="text-sm text-gray-500 mt-1 cursor-pointer hover:text-gray-700"
              onClick={() => setEditingDescription(true)}
            >
              {template.description || 'Click to add description'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/templates/${templateId}/automations`}>
            <Button variant="outline">
              <Zap className="h-4 w-4 mr-2" />
              Manage Automations
            </Button>
          </Link>
          <Button variant={template.is_active ? 'outline' : 'default'} onClick={toggleActive}>
            {template.is_active ? 'Active' : 'Inactive'}
          </Button>
          <Button variant="outline" onClick={handleDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <Badge variant="outline">{tasks.length} tasks</Badge>
        <Badge variant="outline">{externalTasks.length} client tasks</Badge>
        <Badge variant="outline">{internalTasks.length} internal tasks</Badge>
        {template.estimated_days && <Badge variant="outline">{template.estimated_days} days estimated</Badge>}
      </div>

      {/* Stages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Stages</CardTitle>
            <Button size="sm" onClick={addStage}>
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stages.length === 0 && tasks.filter((t) => t.stage_id).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No stages yet. Tasks can be organized into stages or left unsorted.
              </p>
            ) : (
              <>
                {stages
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((stage) => renderStageSection(stage.id, stage.name))}
                {tasks.some((t) => !t.stage_id) && renderStageSection(null, 'Unsorted')}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Add Task Dialog
function AddTaskDialog({
  templateId,
  stageId,
  onAdded,
}: {
  templateId: string;
  stageId: string | null;
  onAdded: (task: TemplateTask) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const created = await apiFetch<TemplateTask>(`/api/templates/${templateId}/tasks`, {
        method: 'POST',
        body: { title: title.trim(), stage_id: stageId, order_index: 0 },
      });
      onAdded(created);
      setTitle('');
      setOpen(false);
      toast.success('Task added');
    } catch (err) {
      toast.error('Failed to add task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Task Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Enter task title..."
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={!title.trim() || submitting} className="bg-[#00c9e3] hover:bg-[#00b3cc]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Task'}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit Task Dialog
function EditTaskDialog({
  task,
  stages,
  allTasks,
  onUpdated,
  templateId,
}: {
  task: TemplateTask;
  stages: Stage[];
  allTasks: TemplateTask[];
  onUpdated: (task: TemplateTask) => void;
  templateId: string;
}) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState(task);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setFormData(task);
  }, [open, task]);

  async function handleSave() {
    setSubmitting(true);
    try {
      const updated = await apiFetch<TemplateTask>(`/api/templates/${templateId}/tasks/${task.id}`, {
        method: 'PATCH',
        body: formData,
      });
      onUpdated(updated);
      setOpen(false);
      toast.success('Task updated');
    } catch (err) {
      toast.error('Failed to update task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData({ ...formData, category: v as TaskCategory })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="documents">Documents</SelectItem>
                  <SelectItem value="setup">Setup</SelectItem>
                  <SelectItem value="signatures">Signatures</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visibility</Label>
              <Select
                value={formData.visibility}
                onValueChange={(v) => setFormData({ ...formData, visibility: v as 'internal' | 'external' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Staff Only</SelectItem>
                  <SelectItem value="external">Client Visible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assignee Type</Label>
              <Select
                value={formData.assignee_type}
                onValueChange={(v) => setFormData({ ...formData, assignee_type: v as 'staff' | 'client' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Days Offset</Label>
              <Input
                type="number"
                value={formData.due_days_offset || ''}
                onChange={(e) => setFormData({ ...formData, due_days_offset: parseInt(e.target.value) || null })}
              />
            </div>
          </div>
          <div>
            <Label>Stage</Label>
            <Select
              value={formData.stage_id || 'none'}
              onValueChange={(v) => setFormData({ ...formData, stage_id: v === 'none' ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Stage (Unsorted)</SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Depends On</Label>
            <Select
              value={formData.depends_on || 'none'}
              onValueChange={(v) => setFormData({ ...formData, depends_on: v === 'none' ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Dependency</SelectItem>
                {allTasks
                  .filter((t) => t.id !== task.id)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.requires_file_upload}
                onCheckedChange={(v) => setFormData({ ...formData, requires_file_upload: !!v })}
              />
              <Label>Requires file upload</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.requires_signature}
                onCheckedChange={(v) => setFormData({ ...formData, requires_signature: !!v })}
              />
              <Label>Requires signature</Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={submitting} className="bg-[#00c9e3] hover:bg-[#00b3cc]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
