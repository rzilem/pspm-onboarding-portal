'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Building2, Calendar, User, X, Tag as TagIcon, LayoutGrid, List, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { formatDate, statusColor, calcProgress } from '@/lib/utils';
import { getApiKey, apiFetch } from '@/lib/hooks';
import type { ProjectSummary, Tag } from '@/lib/types';

export default function ProjectsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-2 bg-gray-200 rounded w-full" />
            </Card>
          ))}
        </div>
      </div>
    }>
      <ProjectsPageContent />
    </Suspense>
  );
}

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial filter values from URL
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [tagFilter, setTagFilter] = useState(searchParams.get('tag') || '');
  const [staffFilter, setStaffFilter] = useState(searchParams.get('staff') || 'all');

  // View mode: list (grid cards) or board (kanban)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  // Drag-and-drop state for kanban board
  const [draggedProject, setDraggedProject] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Debounce ref for search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Derive unique staff emails from projects
  const staffEmails = Array.from(
    new Set(projects.map((p) => p.assigned_staff_email).filter(Boolean) as string[]),
  ).sort();

  // Update URL when filters change
  const updateUrl = useCallback(
    (params: { search?: string; status?: string; tag?: string; staff?: string }) => {
      const sp = new URLSearchParams();
      const s = params.search ?? debouncedSearch;
      const st = params.status ?? statusFilter;
      const tg = params.tag ?? tagFilter;
      const sf = params.staff ?? staffFilter;

      if (s) sp.set('search', s);
      if (st && st !== 'all') sp.set('status', st);
      if (tg) sp.set('tag', tg);
      if (sf && sf !== 'all') sp.set('staff', sf);

      const query = sp.toString();
      router.push(`/projects${query ? `?${query}` : ''}`, { scroll: false });
    },
    [debouncedSearch, statusFilter, tagFilter, staffFilter, router],
  );

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // Fetch projects when filters change
  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, tagFilter, staffFilter, debouncedSearch]);

  // Fetch tags once on mount
  useEffect(() => {
    fetchTags();
  }, []);

  async function fetchTags() {
    try {
      const tags = await apiFetch<Tag[]>('/api/tags');
      setAllTags(tags);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  }

  async function fetchProjects() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (tagFilter) params.set('tag', tagFilter);
      if (staffFilter !== 'all') params.set('staff', staffFilter);

      const data = await apiFetch<ProjectSummary[]>(`/api/projects?${params}`);
      setProjects(data);

      // Sync URL
      updateUrl({ search: debouncedSearch, status: statusFilter, tag: tagFilter, staff: staffFilter });
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value);
  }

  function handleStaffChange(value: string) {
    setStaffFilter(value);
  }

  function handleTagToggle(tagId: string) {
    setTagFilter((prev) => (prev === tagId ? '' : tagId));
  }

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setTagFilter('');
    setStaffFilter('all');
    router.push('/projects', { scroll: false });
  }

  const hasActiveFilters = statusFilter !== 'all' || tagFilter || staffFilter !== 'all' || debouncedSearch;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'list' ? 'bg-[#00c9e3] hover:bg-[#00b0c8] text-white' : ''}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'board' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'board' ? 'bg-[#00c9e3] hover:bg-[#00b0c8] text-white' : ''}
              onClick={() => setViewMode('board')}
              title="Board view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Link href="/projects/new">
            <Button className="bg-[#00c9e3] hover:bg-[#00b0c8]">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by project name, community, or client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={handleStatusChange}>
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

        {staffEmails.length > 0 && (
          <Select value={staffFilter} onValueChange={handleStaffChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Assigned Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffEmails.map((email) => (
                <SelectItem key={email} value={email}>
                  {email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Tag filter pills */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <TagIcon className="h-3.5 w-3.5 text-gray-400" />
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleTagToggle(tag.id)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                  tagFilter === tag.id
                    ? 'ring-2 ring-offset-1 ring-gray-400'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: tag.color + '20',
                  color: tag.color,
                  borderColor: tag.color,
                  border: `1px solid ${tag.color}40`,
                }}
              >
                {tag.name}
                {tagFilter === tag.id && <X className="h-3 w-3" />}
              </button>
            ))}
          </div>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {loading ? (
        viewMode === 'list' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="h-2 bg-gray-200 rounded w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {BOARD_COLUMNS.map((col) => (
              <div key={col.status} className="flex-shrink-0 w-72">
                <div className={`${col.color} h-1.5 rounded-t-lg`} />
                <div className="bg-gray-50 rounded-b-lg p-3 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-1/2 animate-pulse" />
                  <div className="h-24 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardEmpty />
          <h3 className="text-lg font-medium text-gray-900 mt-4">No projects found</h3>
          <p className="text-sm text-gray-500 mt-1">
            {hasActiveFilters ? 'Try adjusting your filters' : 'Create your first onboarding project'}
          </p>
        </Card>
      ) : viewMode === 'list' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-transparent hover:border-l-[#00c9e3]">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 line-clamp-1">{project.name}</h3>
                  <Badge variant="outline" className={statusColor(project.status)}>
                    {project.status}
                  </Badge>
                </div>

                {/* Tag pills */}
                {project.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {project.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: tag.color + '20',
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}

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
                      {project.completed_tasks}/{project.total_tasks} tasks
                      {project.overdue_tasks > 0 && (
                        <span className="text-red-500 ml-1">({project.overdue_tasks} overdue)</span>
                      )}
                    </span>
                    <span className="font-medium text-gray-700">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-1.5" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        /* Kanban Board View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => {
            const columnProjects = projects.filter((p) => p.status === col.status);
            return (
              <div
                key={col.status}
                className="flex-shrink-0 w-72"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverColumn(col.status);
                }}
                onDragLeave={(e) => {
                  // Only clear if leaving the column entirely (not entering a child)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverColumn(null);
                  }
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOverColumn(null);
                  if (!draggedProject) return;

                  const project = projects.find((p) => p.id === draggedProject);
                  if (!project || project.status === col.status) {
                    setDraggedProject(null);
                    return;
                  }

                  try {
                    await apiFetch(`/api/projects/${draggedProject}`, {
                      method: 'PATCH',
                      body: { status: col.status },
                    });
                    toast.success(`Moved "${project.name}" to ${col.label}`);
                    fetchProjects();
                  } catch (err) {
                    console.error('Failed to update project status:', err);
                    toast.error('Failed to update project status');
                  } finally {
                    setDraggedProject(null);
                  }
                }}
              >
                {/* Column header */}
                <div className={`${col.color} h-1.5 rounded-t-lg`} />
                <div
                  className={`rounded-b-lg p-3 min-h-[200px] transition-colors ${
                    dragOverColumn === col.status
                      ? `${col.lightColor} ring-2 ring-[#00c9e3] ring-inset`
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                    <span className="text-xs font-medium text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">
                      {columnProjects.length}
                    </span>
                  </div>

                  {/* Column cards */}
                  <div className="space-y-2">
                    {columnProjects.map((project) => (
                      <div
                        key={project.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggedProject(project.id);
                          e.dataTransfer.effectAllowed = 'move';
                          // Set drag image data for accessibility
                          e.dataTransfer.setData('text/plain', project.id);
                        }}
                        onDragEnd={() => {
                          setDraggedProject(null);
                          setDragOverColumn(null);
                        }}
                        className={`group bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-sm ${
                          draggedProject === project.id ? 'opacity-40 scale-95' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-gray-300 group-hover:text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/projects/${project.id}`}
                              className="text-sm font-medium text-gray-900 line-clamp-2 hover:text-[#00c9e3] transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {project.name}
                            </Link>

                            {project.community_name && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                <Building2 className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{project.community_name}</span>
                              </div>
                            )}

                            {/* Tag pills */}
                            {project.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {project.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                    style={{
                                      backgroundColor: tag.color + '20',
                                      color: tag.color,
                                    }}
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                                {project.tags.length > 3 && (
                                  <span className="text-[9px] text-gray-400">
                                    +{project.tags.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Progress */}
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
                                <span>
                                  {project.completed_tasks}/{project.total_tasks} tasks
                                </span>
                                <span className="font-medium">{project.progress}%</span>
                              </div>
                              <Progress value={project.progress} className="h-1" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {columnProjects.length === 0 && (
                      <div className="text-center py-6 text-xs text-gray-400">
                        {dragOverColumn === col.status ? 'Drop here' : 'No projects'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const BOARD_COLUMNS = [
  { status: 'draft' as const, label: 'Draft', color: 'bg-slate-500', lightColor: 'bg-slate-50' },
  { status: 'active' as const, label: 'Active', color: 'bg-blue-500', lightColor: 'bg-blue-50' },
  { status: 'paused' as const, label: 'Paused', color: 'bg-gray-500', lightColor: 'bg-gray-50' },
  { status: 'completed' as const, label: 'Completed', color: 'bg-emerald-500', lightColor: 'bg-emerald-50' },
];

function ClipboardEmpty() {
  return (
    <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
      <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    </div>
  );
}
