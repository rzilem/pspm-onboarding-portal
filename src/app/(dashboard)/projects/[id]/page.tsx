'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ExternalLink, Copy, Check, FileUp, PenLine,
  MoreHorizontal, Trash2, Clock, User, Building2, Calendar,
  CheckCircle2, Circle, Loader2, AlertCircle, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, formatDateTime, statusColor, calcProgress, categoryLabel } from '@/lib/utils';
import type { Project, Task, OnboardingFile, Signature, ActivityLog } from '@/lib/types';
import { toast } from 'sonner';

function getApiKey(): string {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('admin_api_key') || '';
  }
  return '';
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<OnboardingFile[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const headers = { 'X-API-Key': getApiKey() };

  const fetchAll = useCallback(async () => {
    try {
      const [projRes, tasksRes, filesRes, sigsRes, actRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`, { headers }),
        fetch(`/api/projects/${projectId}/tasks`, { headers }),
        fetch(`/api/projects/${projectId}/files`, { headers }),
        fetch(`/api/projects/${projectId}/signatures`, { headers }),
        fetch(`/api/projects/${projectId}/activity?limit=50`, { headers }),
      ]);

      if (projRes.ok) setProject(await projRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (filesRes.ok) setFiles(await filesRes.json());
      if (sigsRes.ok) setSignatures(await sigsRes.json());
      if (actRes.ok) setActivity(await actRes.json());
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
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setProject(Array.isArray(updated) ? updated[0] : updated);
      toast.success('Project updated');
      fetchAll();
    } else {
      toast.error('Failed to update project');
    }
  }

  async function updateTask(taskId: string, updates: Partial<Task>) {
    const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      toast.success('Task updated');
      fetchAll();
    } else {
      toast.error('Failed to update task');
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
  const externalTasks = tasks.filter((t) => t.visibility === 'external');
  const internalTasks = tasks.filter((t) => t.visibility === 'internal');

  const taskStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'in_progress': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <Badge variant="outline" className={statusColor(project.status)}>
              {project.status}
            </Badge>
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
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-6 mt-4">
          {/* Client Tasks */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Client Tasks ({externalTasks.length})
            </h3>
            <div className="space-y-2">
              {externalTasks.map((task) => (
                <TaskRow key={task.id} task={task} onUpdate={updateTask} />
              ))}
              {externalTasks.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No client tasks</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Staff Tasks */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Internal Tasks ({internalTasks.length})
            </h3>
            <div className="space-y-2">
              {internalTasks.map((task) => (
                <TaskRow key={task.id} task={task} onUpdate={updateTask} />
              ))}
              {internalTasks.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No internal tasks</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
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
                    </div>
                  </div>
                  <Badge variant="outline">{file.file_type?.split('/').pop() || 'file'}</Badge>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="signatures" className="mt-4">
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
    </div>
  );
}

function TaskRow({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => void;
}) {
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
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            onUpdate(task.id, {
              status: task.status === 'completed' ? 'pending' : 'completed',
            })
          }
          className="flex-shrink-0"
        >
          {taskStatusIcon(task.status)}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {task.requires_file_upload && <FileUp className="h-3.5 w-3.5 text-gray-400" />}
          {task.requires_signature && <PenLine className="h-3.5 w-3.5 text-gray-400" />}
          <Badge variant="outline" className="text-xs">
            {categoryLabel(task.category)}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onUpdate(task.id, { status: 'in_progress' })}>
                Mark In Progress
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdate(task.id, { status: 'waiting_client' })}>
                Waiting on Client
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdate(task.id, { status: 'completed' })}>
                Mark Complete
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdate(task.id, { status: 'skipped' })}>
                Skip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
