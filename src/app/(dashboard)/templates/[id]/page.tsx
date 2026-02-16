'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GripVertical, Loader2, FileUp, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { categoryLabel, statusColor } from '@/lib/utils';
import type { Template, TemplateTask } from '@/lib/types';

function getApiKey(): string {
  if (typeof window !== 'undefined') return sessionStorage.getItem('admin_api_key') || '';
  return '';
}

export default function TemplateDetailPage() {
  const params = useParams();
  const templateId = params.id as string;
  const [template, setTemplate] = useState<Template | null>(null);
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/templates/${templateId}`, {
          headers: { 'X-API-Key': getApiKey() },
        });
        if (res.ok) {
          const data = await res.json();
          setTemplate(data.template || data);
          setTasks(data.tasks || []);
        }
      } catch (err) {
        console.error('Failed to load template:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [templateId]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
          {template.description && (
            <p className="text-sm text-gray-500 mt-1">{template.description}</p>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Badge variant="outline">{tasks.length} tasks</Badge>
        <Badge variant="outline">{externalTasks.length} client tasks</Badge>
        <Badge variant="outline">{internalTasks.length} internal tasks</Badge>
        {template.estimated_days && (
          <Badge variant="outline">{template.estimated_days} days estimated</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {tasks
              .sort((a, b) => a.order_index - b.order_index)
              .map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  <span className="text-xs font-mono text-gray-400 w-6">{task.order_index}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-gray-500 line-clamp-1">{task.description}</p>
                    )}
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
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
