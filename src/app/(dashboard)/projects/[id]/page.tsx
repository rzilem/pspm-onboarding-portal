'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ExternalLink, Copy, Check, FileUp, PenLine,
  Clock, User, Building2, Loader2, AlertCircle, Plus,
  ChevronDown, ChevronRight, Trash2, Search, X, CalendarIcon,
  CheckCircle2, Circle, Download, Upload, Mail,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, formatDateTime, statusColor, calcProgress, categoryLabel, cn } from '@/lib/utils';
import type { Project, Task, OnboardingFile, Signature, ActivityLog, Stage, ChecklistItem, Document, TaskStatus, Tag } from '@/lib/types';
import { toast } from 'sonner';
import { apiFetch, getApiKey } from '@/lib/hooks';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [files, setFiles] = useState<OnboardingFile[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Task Dialog
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    category: 'setup',
    visibility: 'internal',
    assignee_type: 'staff',
    due_date: '',
    stage_id: '',
    requires_file_upload: false,
    requires_signature: false,
  });

  // Request Signature Dialog
  const [sigRequestOpen, setSigRequestOpen] = useState(false);
  const [newSigRequest, setNewSigRequest] = useState({
    document_id: '',
    signer_name: '',
    signer_email: '',
    signer_title: '',
    signer_company: '',
    task_id: '',
  });

  // Upload File Dialog
  const [uploadFileOpen, setUploadFileOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTaskId, setUploadTaskId] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  // Send invite state
  const [sendingInvite, setSendingInvite] = useState(false);

  // Project notes state
  const [projectNotes, setProjectNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [lastNotesSaved, setLastNotesSaved] = useState<Date | null>(null);

  // Tags state
  const [projectTags, setProjectTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  const headers = { 'X-API-Key': getApiKey() };

  const fetchAll = useCallback(async () => {
    try {
      const [projRes, tasksRes, stagesRes, filesRes, sigsRes, actRes, docsRes, tagsRes, allTagsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`, { headers }),
        fetch(`/api/projects/${projectId}/tasks`, { headers }),
        fetch(`/api/projects/${projectId}/stages`, { headers }),
        fetch(`/api/projects/${projectId}/files`, { headers }),
        fetch(`/api/projects/${projectId}/signatures`, { headers }),
        fetch(`/api/projects/${projectId}/activity?limit=50`, { headers }),
        fetch(`/api/documents?active_only=true`, { headers }),
        fetch(`/api/projects/${projectId}/tags`, { headers }),
        fetch(`/api/tags`, { headers }),
      ]);

      if (projRes.ok) {
        const proj = await projRes.json();
        setProject(proj);
        setProjectNotes(proj.notes || '');
      }
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (stagesRes.ok) setStages(await stagesRes.json());
      if (filesRes.ok) setFiles(await filesRes.json());
      if (sigsRes.ok) setSignatures(await sigsRes.json());
      if (actRes.ok) setActivity(await actRes.json());
      if (docsRes.ok) setDocuments(await docsRes.json());
      if (tagsRes.ok) setProjectTags(await tagsRes.json());
      if (allTagsRes.ok) setAllTags(await allTagsRes.json());
    } catch (err) {
      console.error('Failed to fetch project:', err);
      toast.error('Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function updateProject(updates: Partial<Project>) {
    try {
      const updated = await apiFetch<Project>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: updates,
      });
      setProject(Array.isArray(updated) ? updated[0] : updated);
      toast.success('Project updated');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update project');
    }
  }

  async function updateTask(taskId: string, updates: Partial<Task>) {
    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: updates,
      });
      toast.success('Task updated');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update task');
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;

    try {
      await apiFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'DELETE',
      });
      toast.success('Task deleted');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete task');
    }
  }

  async function handleAddTask() {
    if (!newTask.title.trim()) {
      toast.error('Title is required');
      return;
    }

    try {
      await apiFetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: {
          ...newTask,
          stage_id: newTask.stage_id || null,
          due_date: newTask.due_date || null,
        },
      });
      toast.success('Task created');
      setAddTaskOpen(false);
      setNewTask({
        title: '',
        description: '',
        category: 'setup',
        visibility: 'internal',
        assignee_type: 'staff',
        due_date: '',
        stage_id: '',
        requires_file_upload: false,
        requires_signature: false,
      });
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create task');
    }
  }

  async function handleBulkComplete() {
    if (selectedTasks.size === 0) return;

    try {
      await apiFetch(`/api/projects/${projectId}/tasks/bulk`, {
        method: 'POST',
        body: {
          task_ids: Array.from(selectedTasks),
          action: 'complete',
        },
      });
      toast.success(`${selectedTasks.size} tasks completed`);
      setSelectedTasks(new Set());
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete tasks');
    }
  }

  async function handleBulkDelete() {
    if (selectedTasks.size === 0) return;
    if (!confirm(`Delete ${selectedTasks.size} tasks?`)) return;

    try {
      await apiFetch(`/api/projects/${projectId}/tasks/bulk`, {
        method: 'POST',
        body: {
          task_ids: Array.from(selectedTasks),
          action: 'delete',
        },
      });
      toast.success(`${selectedTasks.size} tasks deleted`);
      setSelectedTasks(new Set());
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete tasks');
    }
  }

  async function handleRequestSignature() {
    if (!newSigRequest.signer_name.trim() || !newSigRequest.signer_email.trim()) {
      toast.error('Signer name and email are required');
      return;
    }

    try {
      await apiFetch(`/api/projects/${projectId}/signatures`, {
        method: 'POST',
        body: {
          ...newSigRequest,
          document_id: newSigRequest.document_id || null,
          task_id: newSigRequest.task_id || null,
        },
      });
      toast.success('Signature request created');
      setSigRequestOpen(false);
      setNewSigRequest({
        document_id: '',
        signer_name: '',
        signer_email: '',
        signer_title: '',
        signer_company: '',
        task_id: '',
      });
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create signature request');
    }
  }

  async function handleFileUpload() {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (selectedFile.size > maxSize) {
      toast.error('File must be under 50MB');
      return;
    }

    const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif'];
    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      toast.error('File type not allowed. Please upload PDF, Office docs, or images.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (uploadTaskId) formData.append('task_id', uploadTaskId);
      if (uploadDescription) formData.append('description', uploadDescription);

      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'X-API-Key': getApiKey() },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      toast.success('File uploaded successfully');
      setUploadFileOpen(false);
      setSelectedFile(null);
      setUploadTaskId('');
      setUploadDescription('');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  async function downloadFile(fileId: string, fileName: string) {
    try {
      const response = await fetch(`/api/projects/${projectId}/files/${fileId}/download`, {
        headers: { 'X-API-Key': getApiKey() },
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download file');
    }
  }

  async function saveNotes() {
    setNotesSaving(true);
    try {
      await updateProject({ notes: projectNotes });
      setLastNotesSaved(new Date());
    } finally {
      setNotesSaving(false);
    }
  }

  async function addTag(tagId: string) {
    try {
      await apiFetch(`/api/projects/${projectId}/tags`, {
        method: 'POST',
        body: { tag_id: tagId },
      });
      // Refresh tags
      const tagsRes = await fetch(`/api/projects/${projectId}/tags`, { headers });
      if (tagsRes.ok) setProjectTags(await tagsRes.json());
      setTagPopoverOpen(false);
      toast.success('Tag added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add tag');
    }
  }

  async function removeTag(tagId: string) {
    try {
      await apiFetch(`/api/projects/${projectId}/tags?tag_id=${tagId}`, {
        method: 'DELETE',
      });
      setProjectTags((prev) => prev.filter((t) => t.id !== tagId));
      toast.success('Tag removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove tag');
    }
  }

  function copyPortalLink() {
    if (!project) return;
    const url = `${window.location.origin}/p/${project.public_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Portal link copied');
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendInviteEmail() {
    if (!project?.client_contact_email) {
      toast.error('No client email on file');
      return;
    }

    setSendingInvite(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/invite`, {
        method: 'POST',
        headers: { 'X-API-Key': getApiKey() },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invite');
      }

      const data = await response.json();
      toast.success(`Invite sent to ${project.client_contact_email}`);
      fetchAll(); // Refresh activity log
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  }

  function toggleStageCollapse(stageId: string) {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  }

  function toggleTaskSelection(taskId: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
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

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Link href="/projects" className="text-[#00c9e3] hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const progress = calcProgress(completedTasks, tasks.length);

  // Filter tasks
  let filteredTasks = tasks;
  if (statusFilter !== 'all') {
    filteredTasks = filteredTasks.filter((t) => t.status === statusFilter);
  }
  if (categoryFilter !== 'all') {
    filteredTasks = filteredTasks.filter((t) => t.category === categoryFilter);
  }
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredTasks = filteredTasks.filter((t) => t.title.toLowerCase().includes(query));
  }

  // Group tasks by stage
  const unsortedTasks = filteredTasks.filter((t) => !t.stage_id);
  const stageGroups = stages.map((stage) => ({
    stage,
    tasks: filteredTasks.filter((t) => t.stage_id === stage.id),
  }));

  const taskStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'in_progress': return <Loader2 className="h-4 w-4 text-blue-500" />;
      case 'waiting_client': return <Clock className="h-4 w-4 text-amber-500" />;
      case 'skipped': return <AlertCircle className="h-4 w-4 text-gray-400" />;
      default: return <Circle className="h-4 w-4 text-gray-300" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <Badge variant="outline" className={statusColor(project.status)}>
              {project.status}
            </Badge>
            {/* Tag pills */}
            {projectTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium group"
                style={{
                  backgroundColor: tag.color + '20',
                  color: tag.color,
                }}
              >
                {tag.name}
                <button
                  onClick={() => removeTag(tag.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {/* Add tag button */}
            <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                  <Plus className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <p className="text-xs font-medium text-gray-500 mb-2 px-1">Add tag</p>
                {allTags.filter((t) => !projectTags.some((pt) => pt.id === t.id)).length === 0 ? (
                  <p className="text-xs text-gray-400 px-1 py-2">All tags assigned</p>
                ) : (
                  <div className="space-y-1">
                    {allTags
                      .filter((t) => !projectTags.some((pt) => pt.id === t.id))
                      .map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => addTag(tag.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-gray-100 transition-colors text-left"
                        >
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </button>
                      ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          {project.community_name && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {project.community_name}
              {project.total_units && ` · ${project.total_units} units`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={sendInviteEmail}
            disabled={sendingInvite || !project.client_contact_email}
          >
            {sendingInvite ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-1" />
            )}
            Send Invite
          </Button>
          <Button variant="outline" size="sm" onClick={copyPortalLink}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? 'Copied' : 'Portal Link'}
          </Button>
          <a
            href={`/p/${project.public_token}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-1" />
              View Portal
            </Button>
          </a>
          <Select
            value={project.status}
            onValueChange={(status) => updateProject({ status } as Partial<Project>)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Overall Progress: {completedTasks}/{tasks.length} tasks
          </span>
          <span className="text-sm font-bold text-[#00c9e3]">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </Card>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Client Contact</p>
          <p className="font-medium text-sm">{project.client_contact_name || '—'}</p>
          <p className="text-xs text-gray-500">{project.client_contact_email || ''}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Assigned Staff</p>
          <p className="font-medium text-sm">{project.assigned_staff_email || 'Unassigned'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Start Date</p>
          <p className="font-medium text-sm">{formatDate(project.management_start_date)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Target Completion</p>
          <p className="font-medium text-sm">{formatDate(project.target_completion_date)}</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
          <TabsTrigger value="signatures">Signatures ({signatures.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4 mt-4">
          {/* Task controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={() => setAddTaskOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>

            {selectedTasks.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-gray-600">{selectedTasks.size} selected</span>
                <Button size="sm" variant="outline" onClick={handleBulkComplete}>
                  Mark Complete
                </Button>
                <Button size="sm" variant="outline" onClick={handleBulkDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedTasks(new Set())}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Task filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting_client">Waiting Client</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="documents">Documents</SelectItem>
                <SelectItem value="setup">Setup</SelectItem>
                <SelectItem value="signatures">Signatures</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="communication">Communication</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stage-grouped tasks */}
          <div className="space-y-4">
            {stageGroups.map(({ stage, tasks: stageTasks }) => {
              if (stageTasks.length === 0) return null;
              const isCollapsed = collapsedStages.has(stage.id);

              return (
                <div key={stage.id} className="border rounded-lg">
                  <button
                    onClick={() => toggleStageCollapse(stage.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                      <h3 className="font-semibold text-sm">{stage.name}</h3>
                      <Badge variant="outline" className={statusColor(stage.status)}>
                        {stage.status}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {stageTasks.filter((t) => t.status === 'completed').length}/{stageTasks.length}
                      </span>
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div className="border-t p-3 space-y-2">
                      {stageTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          selected={selectedTasks.has(task.id)}
                          onToggleSelect={() => toggleTaskSelection(task.id)}
                          onUpdate={updateTask}
                          onDelete={deleteTask}
                          projectId={projectId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unsorted tasks */}
            {unsortedTasks.length > 0 && (
              <div className="border rounded-lg">
                <div className="p-3 bg-gray-50">
                  <h3 className="font-semibold text-sm text-gray-600">
                    Unsorted Tasks ({unsortedTasks.length})
                  </h3>
                </div>
                <div className="p-3 space-y-2">
                  {unsortedTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedTasks.has(task.id)}
                      onToggleSelect={() => toggleTaskSelection(task.id)}
                      onUpdate={updateTask}
                      onDelete={deleteTask}
                      projectId={projectId}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredTasks.length === 0 && (
              <p className="text-sm text-gray-400 py-8 text-center">No tasks match filters</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="files" className="mt-4 space-y-4">
          <Button onClick={() => setUploadFileOpen(true)} size="sm">
            <Upload className="h-4 w-4 mr-1" />
            Upload File
          </Button>

          {files.length === 0 ? (
            <Card className="p-8 text-center">
              <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No files uploaded yet</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <Card key={file.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileUp className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">{file.file_name}</p>
                      <p className="text-xs text-gray-500">
                        {file.uploaded_by_type === 'client' ? 'Client' : 'Staff'} · {formatDateTime(file.created_at)}
                      </p>
                      {file.description && (
                        <p className="text-xs text-gray-600 mt-1">{file.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{file.file_type?.split('/').pop() || 'file'}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => downloadFile(file.id, file.file_name)}
                    >
                      <Download className="h-3.5 w-3.5 text-gray-400 hover:text-[#00c9e3]" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="signatures" className="mt-4 space-y-4">
          <Button onClick={() => setSigRequestOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Request Signature
          </Button>

          {signatures.length === 0 ? (
            <Card className="p-8 text-center">
              <PenLine className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No signature requests yet</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {signatures.map((sig) => (
                <Card key={sig.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{sig.signer_name}</p>
                    <p className="text-xs text-gray-500">{sig.signer_email}</p>
                  </div>
                  <Badge variant="outline" className={statusColor(sig.status)}>
                    {sig.status}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="project-notes">Project Notes</Label>
                {lastNotesSaved && (
                  <span className="text-xs text-gray-500">
                    Last saved {formatDateTime(lastNotesSaved.toISOString())}
                  </span>
                )}
              </div>
              <Textarea
                id="project-notes"
                value={projectNotes}
                onChange={(e) => setProjectNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Add notes about this project..."
                rows={12}
                className="resize-none"
              />
              {notesSaving && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {activity.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-gray-700">
                      <span className="font-medium">{entry.actor || 'System'}</span>{' '}
                      {entry.action}
                    </p>
                    <p className="text-xs text-gray-400">{formatDateTime(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Task Dialog */}
      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>Create a new task for this project</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Task title"
              />
            </div>

            <div>
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Task description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-category">Category</Label>
                <Select
                  value={newTask.category}
                  onValueChange={(category) => setNewTask({ ...newTask, category })}
                >
                  <SelectTrigger id="task-category">
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
                <Label htmlFor="task-visibility">Visibility</Label>
                <Select
                  value={newTask.visibility}
                  onValueChange={(visibility) => setNewTask({ ...newTask, visibility })}
                >
                  <SelectTrigger id="task-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal (Staff Only)</SelectItem>
                    <SelectItem value="external">External (Client Visible)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-assignee">Assignee Type</Label>
                <Select
                  value={newTask.assignee_type}
                  onValueChange={(assignee_type) => setNewTask({ ...newTask, assignee_type })}
                >
                  <SelectTrigger id="task-assignee">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="task-stage">Stage</Label>
                <Select
                  value={newTask.stage_id}
                  onValueChange={(stage_id) => setNewTask({ ...newTask, stage_id })}
                >
                  <SelectTrigger id="task-stage">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="task-due-date">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="task-due-date"
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !newTask.due_date && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newTask.due_date ? format(new Date(newTask.due_date), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={newTask.due_date ? new Date(newTask.due_date) : undefined}
                    onSelect={(date) =>
                      setNewTask({
                        ...newTask,
                        due_date: date ? format(date, 'yyyy-MM-dd') : '',
                      })
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="task-file-upload"
                  checked={newTask.requires_file_upload}
                  onCheckedChange={(checked) =>
                    setNewTask({ ...newTask, requires_file_upload: !!checked })
                  }
                />
                <Label htmlFor="task-file-upload" className="text-sm font-normal cursor-pointer">
                  Requires file upload
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="task-signature"
                  checked={newTask.requires_signature}
                  onCheckedChange={(checked) =>
                    setNewTask({ ...newTask, requires_signature: !!checked })
                  }
                />
                <Label htmlFor="task-signature" className="text-sm font-normal cursor-pointer">
                  Requires signature
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTask}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload File Dialog */}
      <Dialog open={uploadFileOpen} onOpenChange={setUploadFileOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>Upload a file for this project</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#00c9e3] transition-colors cursor-pointer"
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
              />
              {selectedFile ? (
                <div>
                  <FileUp className="h-8 w-8 text-[#00c9e3] mx-auto mb-2" />
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium mb-1">Drop a file here or click to browse</p>
                  <p className="text-xs text-gray-500">
                    PDF, Office docs, or images · Max 50MB
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="upload-task">Link to Task (optional)</Label>
              <Select value={uploadTaskId} onValueChange={setUploadTaskId}>
                <SelectTrigger id="upload-task">
                  <SelectValue placeholder="Select a task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="upload-description">Description (optional)</Label>
              <Textarea
                id="upload-description"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Add a description for this file..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadFileOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFileUpload} disabled={!selectedFile || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Upload'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Signature Dialog */}
      <Dialog open={sigRequestOpen} onOpenChange={setSigRequestOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Signature</DialogTitle>
            <DialogDescription>Create a new signature request</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="sig-document">Document (optional)</Label>
              <Select
                value={newSigRequest.document_id}
                onValueChange={(document_id) => setNewSigRequest({ ...newSigRequest, document_id })}
              >
                <SelectTrigger id="sig-document">
                  <SelectValue placeholder="Select a document" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sig-signer-name">Signer Name *</Label>
                <Input
                  id="sig-signer-name"
                  value={newSigRequest.signer_name}
                  onChange={(e) => setNewSigRequest({ ...newSigRequest, signer_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>

              <div>
                <Label htmlFor="sig-signer-email">Signer Email *</Label>
                <Input
                  id="sig-signer-email"
                  type="email"
                  value={newSigRequest.signer_email}
                  onChange={(e) => setNewSigRequest({ ...newSigRequest, signer_email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sig-signer-title">Signer Title (optional)</Label>
                <Input
                  id="sig-signer-title"
                  value={newSigRequest.signer_title}
                  onChange={(e) => setNewSigRequest({ ...newSigRequest, signer_title: e.target.value })}
                  placeholder="Board President"
                />
              </div>

              <div>
                <Label htmlFor="sig-signer-company">Signer Company (optional)</Label>
                <Input
                  id="sig-signer-company"
                  value={newSigRequest.signer_company}
                  onChange={(e) => setNewSigRequest({ ...newSigRequest, signer_company: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="sig-task">Link to Task (optional)</Label>
              <Select
                value={newSigRequest.task_id}
                onValueChange={(task_id) => setNewSigRequest({ ...newSigRequest, task_id })}
              >
                <SelectTrigger id="sig-task">
                  <SelectValue placeholder="Select a task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSigRequestOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequestSignature}>Create Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({
  task,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
  projectId,
}: {
  task: Task;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (taskId: string, updates: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editData, setEditData] = useState({
    title: task.title,
    description: task.description || '',
    staff_notes: task.staff_notes || '',
    due_date: task.due_date || '',
    checklist: task.checklist || [],
  });
  const [newChecklistItem, setNewChecklistItem] = useState('');

  const isOverdue = task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date();

  function handleSave() {
    onUpdate(task.id, editData);
    setExpanded(false);
  }

  function handleCancel() {
    setEditData({
      title: task.title,
      description: task.description || '',
      staff_notes: task.staff_notes || '',
      due_date: task.due_date || '',
      checklist: task.checklist || [],
    });
    setExpanded(false);
  }

  function toggleChecklistItem(itemId: string) {
    const updated = editData.checklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    );
    setEditData({ ...editData, checklist: updated });
    onUpdate(task.id, { checklist: updated });
  }

  function addChecklistItem() {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newChecklistItem,
      completed: false,
    };
    const updated = [...editData.checklist, newItem];
    setEditData({ ...editData, checklist: updated });
    onUpdate(task.id, { checklist: updated });
    setNewChecklistItem('');
  }

  function removeChecklistItem(itemId: string) {
    const updated = editData.checklist.filter((item) => item.id !== itemId);
    setEditData({ ...editData, checklist: updated });
    onUpdate(task.id, { checklist: updated });
  }

  const taskStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'in_progress': return <Loader2 className="h-4 w-4 text-blue-500" />;
      case 'waiting_client': return <Clock className="h-4 w-4 text-amber-500" />;
      case 'skipped': return <AlertCircle className="h-4 w-4 text-gray-400" />;
      default: return <Circle className="h-4 w-4 text-gray-300" />;
    }
  };

  const completedChecklistCount = task.checklist.filter((i) => i.completed).length;

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-0.5" />

        <button
          onClick={() =>
            onUpdate(task.id, {
              status: task.status === 'completed' ? 'pending' : 'completed',
            })
          }
          className="flex-shrink-0 mt-0.5"
        >
          {taskStatusIcon(task.status)}
        </button>

        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-left w-full"
          >
            <p
              className={`text-sm font-medium ${
                task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'
              }`}
            >
              {task.title}
            </p>
            {task.description && !expanded && (
              <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{task.description}</p>
            )}
          </button>

          {/* Due date and checklist indicators */}
          <div className="flex items-center gap-3 mt-1">
            {task.due_date && (
              <div className="flex items-center gap-1 text-xs">
                <CalendarIcon className="h-3 w-3 text-gray-400" />
                <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                  {format(new Date(task.due_date), 'MMM d')}
                  {isOverdue && <Badge variant="outline" className="ml-1 text-xs bg-red-50 text-red-600 border-red-200">Overdue</Badge>}
                </span>
              </div>
            )}

            {task.checklist.length > 0 && (
              <div className="text-xs text-gray-500">
                {completedChecklistCount}/{task.checklist.length} items
              </div>
            )}
          </div>

          {/* Expanded edit area */}
          {expanded && (
            <div className="mt-4 space-y-3 border-t pt-3">
              <div>
                <Label htmlFor={`task-title-${task.id}`} className="text-xs">Title</Label>
                <Input
                  id={`task-title-${task.id}`}
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="text-sm"
                />
              </div>

              <div>
                <Label htmlFor={`task-description-${task.id}`} className="text-xs">Description</Label>
                <Textarea
                  id={`task-description-${task.id}`}
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows={2}
                  className="text-sm"
                />
              </div>

              <div>
                <Label htmlFor={`task-staff-notes-${task.id}`} className="text-xs">Staff Notes</Label>
                <Textarea
                  id={`task-staff-notes-${task.id}`}
                  value={editData.staff_notes}
                  onChange={(e) => setEditData({ ...editData, staff_notes: e.target.value })}
                  rows={2}
                  className="text-sm"
                  placeholder="Internal notes for staff..."
                />
              </div>

              <div>
                <Label htmlFor={`task-due-date-${task.id}`} className="text-xs">Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id={`task-due-date-${task.id}`}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !editData.due_date && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editData.due_date ? format(new Date(editData.due_date), 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editData.due_date ? new Date(editData.due_date) : undefined}
                      onSelect={(date) =>
                        setEditData({
                          ...editData,
                          due_date: date ? format(date, 'yyyy-MM-dd') : '',
                        })
                      }
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Checklist editor */}
              <div>
                <Label className="text-xs">Checklist</Label>
                <div className="space-y-2 mt-2">
                  {editData.checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={item.completed}
                        onCheckedChange={() => toggleChecklistItem(item.id)}
                      />
                      <span className={cn('text-sm flex-1', item.completed && 'line-through text-gray-400')}>
                        {item.text}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => removeChecklistItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <Input
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addChecklistItem();
                        }
                      }}
                      placeholder="Add checklist item..."
                      className="text-sm"
                    />
                    <Button size="sm" onClick={addChecklistItem}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {task.requires_file_upload && <FileUp className="h-3.5 w-3.5 text-gray-400" />}
          {task.requires_signature && <PenLine className="h-3.5 w-3.5 text-gray-400" />}
          <Badge variant="outline" className="text-xs">
            {categoryLabel(task.category)}
          </Badge>

          <Select
            value={task.status}
            onValueChange={(status) => onUpdate(task.id, { status: status as TaskStatus })}
          >
            <SelectTrigger className="w-[130px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_client">Waiting Client</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
