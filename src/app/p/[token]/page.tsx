'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, Circle, Upload, PenLine, FileText,
  Loader2, PartyPopper, Building2, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { formatDate, categoryLabel, statusColor } from '@/lib/utils';
import type { PortalView } from '@/lib/types';
import { toast } from 'sonner';

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#00c9e3]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* PSPM Header */}
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#00c9e3] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">PS</span>
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">PS Property Management</h1>
            <p className="text-xs text-gray-500">Community Onboarding Portal</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
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

        {/* Task list */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Your Tasks</h3>
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

        {/* Footer */}
        <Separator />
        <div className="text-center text-xs text-gray-400 pb-8">
          <p>PS Property Management · Serving Central Texas since 1987</p>
          <p className="mt-1">(512) 251-6122 · info@psprop.net</p>
        </div>
      </main>
    </div>
  );
}
