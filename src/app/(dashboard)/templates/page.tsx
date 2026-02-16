'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, LayoutTemplate, Loader2, ChevronRight, Copy, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/hooks';
import type { Template } from '@/lib/types';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTemplates() {
    try {
      const data = await apiFetch<Template[]>('/api/templates');
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  async function handleDuplicate(template: Template, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    try {
      const duplicated = await apiFetch<Template>(
        `/api/templates?duplicate=true&source_id=${template.id}`,
        { method: 'POST' },
      );
      toast.success(`Template "${template.name}" duplicated`);
      setTemplates((prev) => [duplicated, ...prev]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate template');
    }
  }

  async function handleDelete(template: Template, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${template.name}"?`)) return;

    try {
      await apiFetch(`/api/templates/${template.id}`, { method: 'DELETE' });
      toast.success('Template deleted');
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable project blueprints with predefined tasks</p>
        </div>
        <Link href="/templates/new">
          <Button className="bg-[#00c9e3] hover:bg-[#00b3cc] text-white">
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center">
          <LayoutTemplate className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">No templates yet</h3>
          <p className="text-sm text-gray-500 mt-1">Create your first onboarding template</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const taskCount = t.tasks?.length || 0;

            return (
              <Card key={t.id} className="p-5 hover:shadow-md transition-shadow group">
                <div className="flex items-center justify-between">
                  <Link href={`/templates/${t.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{t.name}</h3>
                      {t.is_active ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-400">Inactive</Badge>
                      )}
                      {taskCount > 0 && (
                        <Badge variant="outline" className="text-gray-500">
                          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                        </Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">{t.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {t.estimated_days ? `${t.estimated_days} days estimated` : 'No estimate'}
                    </p>
                  </Link>

                  <div className="flex items-center gap-2">
                    <ChevronRight className="h-5 w-5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleDuplicate(t, e)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(t, e)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
