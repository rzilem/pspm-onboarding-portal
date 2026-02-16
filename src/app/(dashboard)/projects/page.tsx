'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Building2, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { formatDate, statusColor, calcProgress } from '@/lib/utils';
import type { Project, Task } from '@/lib/types';

interface ProjectWithTasks extends Project {
  task_stats?: { total: number; completed: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchProjects();
  }, [statusFilter]);

  async function fetchProjects() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/projects?${params}`, {
        headers: { 'X-API-Key': getApiKey() },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProjects(data);

      // Fetch task stats for each project
      const taskMap: Record<string, Task[]> = {};
      await Promise.all(
        data.map(async (p: Project) => {
          const tRes = await fetch(`/api/projects/${p.id}/tasks`, {
            headers: { 'X-API-Key': getApiKey() },
          });
          if (tRes.ok) {
            taskMap[p.id] = await tRes.json();
          }
        }),
      );
      setTasks(taskMap);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }

  function getApiKey(): string {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('admin_api_key') || '';
    }
    return '';
  }

  const filtered = projects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.community_name?.toLowerCase().includes(q) ||
      p.client_contact_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="bg-[#00c9e3] hover:bg-[#00b0c8]">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </Link>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-2 bg-gray-200 rounded w-full" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardEmpty />
          <h3 className="text-lg font-medium text-gray-900 mt-4">No projects found</h3>
          <p className="text-sm text-gray-500 mt-1">
            {search ? 'Try a different search term' : 'Create your first onboarding project'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => {
            const projectTasks = tasks[project.id] || [];
            const completed = projectTasks.filter((t) => t.status === 'completed').length;
            const total = projectTasks.length;
            const progress = calcProgress(completed, total);

            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-transparent hover:border-l-[#00c9e3]">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{project.name}</h3>
                    <Badge variant="outline" className={statusColor(project.status)}>
                      {project.status}
                    </Badge>
                  </div>

                  {project.community_name && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {project.community_name}
                    </div>
                  )}

                  {project.client_contact_name && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                      <User className="h-3.5 w-3.5" />
                      {project.client_contact_name}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(project.created_at)}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        {completed}/{total} tasks
                      </span>
                      <span className="font-medium text-gray-700">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClipboardEmpty() {
  return (
    <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
      <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    </div>
  );
}
