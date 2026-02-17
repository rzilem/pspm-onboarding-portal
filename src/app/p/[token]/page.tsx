'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, Circle, Upload, PenLine, FileText,
  Loader2, PartyPopper, Building2, Calendar,
  ChevronDown, ChevronRight, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatDate, categoryLabel, statusColor } from '@/lib/utils';
import type { PortalView } from '@/lib/types';
import { toast } from 'sonner';

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function completeTask(taskId: string) {
    try {
      const res = await fetch(`/api/portal/${token}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (res.ok) {
        toast.success('Task marked complete');
        fetchData();
      } else {
        toast.error('Failed to update task');
      }
    } catch {
      toast.error('Something went wrong');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#00c9e3]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900">Portal Not Found</h2>
          <p className="text-sm text-gray-500 mt-2">
            This link may be invalid or the project is no longer active.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Contact PS Property Management at (512) 251-6122 if you need assistance.
          </p>
        </Card>
      </div>
    );
  }

  const allDone = data.progress === 100;
  const pendingSignatures = data.signatures.filter((s) => s.status !== 'signed');
  const signedSignatures = data.signatures.filter((s) => s.status === 'signed');
  const hasStages = data.stages.length > 0;

  function toggleStage(stageId: string) {
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Project header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{data.project.name}</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            {data.project.community_name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {data.project.community_name}
              </span>
            )}
            {data.project.management_start_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Start: {formatDate(data.project.management_start_date)}
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-gray-900">Onboarding Progress</span>
            <span className="text-lg font-bold text-[#00c9e3]">{data.progress}%</span>
          </div>
          <Progress value={data.progress} className="h-3" />
          <p className="text-xs text-gray-500 mt-2">
            {data.completed_tasks} of {data.total_tasks} tasks completed
          </p>
        </Card>

        {/* Stage stepper */}
        {hasStages && (
          <Card className="p-5">
            <div className="overflow-x-auto">
              <div className="flex items-start min-w-max">
                {data.stages.map((stage, idx) => {
                  const isCompleted = stage.status === 'completed';
                  const isActive = stage.status === 'active';
                  const isLast = idx === data.stages.length - 1;

                  return (
                    <div key={stage.id} className="flex items-start flex-1 min-w-[100px]">
                      {/* Stage dot + label */}
                      <div className="flex flex-col items-center text-center">
                        <div
                          className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-colors ${
                            isCompleted
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : isActive
                                ? 'bg-[#00c9e3] border-[#00c9e3] text-white'
                                : 'bg-white border-gray-300 text-gray-400'
                          }`}
                        >
                          {isCompleted ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <span className="text-xs font-semibold">{idx + 1}</span>
                          )}
                        </div>
                        <p
                          className={`mt-1.5 text-xs font-medium max-w-[90px] leading-tight ${
                            isCompleted
                              ? 'text-emerald-600'
                              : isActive
                                ? 'text-[#00c9e3]'
                                : 'text-gray-400'
                          }`}
                        >
                          {stage.name}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {stage.completed_tasks}/{stage.total_tasks}
                        </p>
                      </div>

                      {/* Connecting line */}
                      {!isLast && (
                        <div className="flex-1 flex items-center pt-[18px] px-2">
                          <div
                            className={`h-0.5 w-full ${
                              isCompleted ? 'bg-emerald-500' : 'bg-gray-200'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* Completion celebration */}
        {allDone && (
          <Card className="p-8 text-center bg-emerald-50 border-emerald-200">
            <PartyPopper className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-emerald-800">All Done!</h3>
            <p className="text-sm text-emerald-600 mt-2">
              Thank you for completing all onboarding tasks. Our team will be in touch shortly.
            </p>
          </Card>
        )}

        {/* Pending signatures */}
        {pendingSignatures.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Signatures Needed ({pendingSignatures.length})
            </h3>
            <div className="space-y-2">
              {pendingSignatures.map((sig) => (
                <Card key={sig.id} className="p-4 flex items-center justify-between border-amber-200 bg-amber-50/50">
                  <div>
                    <p className="font-medium text-gray-900">{sig.signer_name}</p>
                    <Badge variant="outline" className={statusColor(sig.status)}>
                      {sig.status === 'pending' ? 'Awaiting Signature' : sig.status}
                    </Badge>
                  </div>
                  <Link href={`/p/${token}/sign/${sig.id}`}>
                    <Button size="sm" className="bg-[#00c9e3] hover:bg-[#00b0c8]">
                      <PenLine className="h-3.5 w-3.5 mr-1" />
                      Sign Now
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Task list — grouped by stage when stages exist, flat otherwise */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Your Tasks</h3>

          {hasStages ? (
            <div className="space-y-4">
              {data.stages.map((stage) => {
                const stageTasks = data.tasks.filter((t) => t.stage_id === stage.id);
                if (stageTasks.length === 0) return null;

                const isCollapsed = collapsedStages.has(stage.id);
                const stageCompleted = stage.completed_tasks === stage.total_tasks && stage.total_tasks > 0;
                const stageActive = stage.status === 'active';

                return (
                  <div key={stage.id}>
                    {/* Stage group header */}
                    <button
                      onClick={() => toggleStage(stage.id)}
                      className="flex items-center gap-2 w-full text-left mb-2 group"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                      )}
                      <span
                        className={`text-sm font-semibold ${
                          stageCompleted
                            ? 'text-emerald-600'
                            : stageActive
                              ? 'text-[#00c9e3]'
                              : 'text-gray-700'
                        }`}
                      >
                        {stage.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ml-1 ${
                          stageCompleted
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : stageActive
                              ? 'bg-sky-500/10 text-sky-600 border-sky-500/20'
                              : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                        }`}
                      >
                        {stage.completed_tasks}/{stage.total_tasks} completed
                      </Badge>
                    </button>

                    {/* Stage tasks */}
                    {!isCollapsed && (
                      <div className="space-y-2 ml-6">
                        {stageTasks.map((task) => {
                          const isCompleted = task.status === 'completed';
                          return (
                            <Card key={task.id} className={`p-4 ${isCompleted ? 'opacity-60' : ''}`}>
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => !isCompleted && completeTask(task.id)}
                                  disabled={isCompleted}
                                  className="mt-0.5 flex-shrink-0"
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                  ) : (
                                    <Circle className="h-5 w-5 text-gray-300 hover:text-[#00c9e3] transition-colors" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                    {task.title}
                                  </p>
                                  {task.description && (
                                    <p className="text-sm text-gray-500 mt-0.5">{task.description}</p>
                                  )}
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      {categoryLabel(task.category)}
                                    </Badge>
                                    {task.requires_file_upload && !isCompleted && (
                                      <Link href={`/p/${token}/upload/${task.id}`}>
                                        <Button variant="outline" size="sm" className="h-6 text-xs">
                                          <Upload className="h-3 w-3 mr-1" />
                                          Upload File
                                        </Button>
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Tasks without a stage */}
              {(() => {
                const stageIds = new Set(data.stages.map((s) => s.id));
                const unstagedTasks = data.tasks.filter((t) => !t.stage_id || !stageIds.has(t.stage_id));
                if (unstagedTasks.length === 0) return null;

                const isCollapsed = collapsedStages.has('__unstaged__');

                return (
                  <div>
                    <button
                      onClick={() => toggleStage('__unstaged__')}
                      className="flex items-center gap-2 w-full text-left mb-2 group"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                      )}
                      <span className="text-sm font-semibold text-gray-700">Other Tasks</span>
                      <Badge variant="outline" className="text-[10px] ml-1 bg-gray-500/10 text-gray-500 border-gray-500/20">
                        {unstagedTasks.filter((t) => t.status === 'completed').length}/{unstagedTasks.length} completed
                      </Badge>
                    </button>

                    {!isCollapsed && (
                      <div className="space-y-2 ml-6">
                        {unstagedTasks.map((task) => {
                          const isCompleted = task.status === 'completed';
                          return (
                            <Card key={task.id} className={`p-4 ${isCompleted ? 'opacity-60' : ''}`}>
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => !isCompleted && completeTask(task.id)}
                                  disabled={isCompleted}
                                  className="mt-0.5 flex-shrink-0"
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                  ) : (
                                    <Circle className="h-5 w-5 text-gray-300 hover:text-[#00c9e3] transition-colors" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                    {task.title}
                                  </p>
                                  {task.description && (
                                    <p className="text-sm text-gray-500 mt-0.5">{task.description}</p>
                                  )}
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      {categoryLabel(task.category)}
                                    </Badge>
                                    {task.requires_file_upload && !isCompleted && (
                                      <Link href={`/p/${token}/upload/${task.id}`}>
                                        <Button variant="outline" size="sm" className="h-6 text-xs">
                                          <Upload className="h-3 w-3 mr-1" />
                                          Upload File
                                        </Button>
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Flat task list — backwards compatible when no stages exist */
            <div className="space-y-2">
              {data.tasks.map((task) => {
                const isCompleted = task.status === 'completed';

                return (
                  <Card key={task.id} className={`p-4 ${isCompleted ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => !isCompleted && completeTask(task.id)}
                        disabled={isCompleted}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-300 hover:text-[#00c9e3] transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-sm text-gray-500 mt-0.5">{task.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {categoryLabel(task.category)}
                          </Badge>
                          {task.requires_file_upload && !isCompleted && (
                            <Link href={`/p/${token}/upload/${task.id}`}>
                              <Button variant="outline" size="sm" className="h-6 text-xs">
                                <Upload className="h-3 w-3 mr-1" />
                                Upload File
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Uploaded files */}
        {data.files.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Uploaded Files ({data.files.length})
            </h3>
            <div className="space-y-2">
              {data.files.map((file) => (
                <Card key={file.id} className="p-3 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">{file.file_name}</p>
                    <p className="text-xs text-gray-400">{formatDate(file.created_at)}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

    </div>
  );
}
