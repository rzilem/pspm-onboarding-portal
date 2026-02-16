'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSignature,
  FolderOpen,
  ListTodo,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/hooks';
import type { DashboardStats } from '@/lib/types';

// --- Types for report endpoints ---

interface ProjectHealth {
  id: string;
  name: string;
  community_name: string | null;
  assigned_staff_email: string | null;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  days_active: number;
  overdue_count: number;
  health: 'healthy' | 'at_risk' | 'critical';
}

interface PipelineData {
  by_status: {
    draft: number;
    active: number;
    paused: number;
    completed: number;
    cancelled: number;
  };
  completion_timeline: Array<{
    month: string;
    completed: number;
    started: number;
  }>;
  stage_distribution: Array<{
    stage_name: string;
    project_count: number;
    avg_progress: number;
  }>;
}

// --- Health badge colors ---

function healthBadgeClass(health: string): string {
  switch (health) {
    case 'critical':
      return 'bg-red-500/10 text-red-700 border-red-500/20';
    case 'at_risk':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    case 'healthy':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  }
}

function healthLabel(health: string): string {
  switch (health) {
    case 'critical':
      return 'Critical';
    case 'at_risk':
      return 'At Risk';
    case 'healthy':
      return 'Healthy';
    default:
      return health;
  }
}

// --- Pipeline status colors ---

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  active: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// --- Skeleton components ---

function KpiSkeleton() {
  return (
    <Card className="bg-white">
      <CardContent className="pt-6">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="h-8 w-16 bg-gray-200 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded" />
      ))}
    </div>
  );
}

// --- Main Dashboard ---

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [healthData, setHealthData] = useState<ProjectHealth[] | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [statsData, healthRes, pipelineRes] = await Promise.all([
          apiFetch<DashboardStats>('/api/stats'),
          apiFetch<ProjectHealth[]>('/api/reports/health'),
          apiFetch<PipelineData>('/api/reports/pipeline'),
        ]);

        setStats(statsData);
        setHealthData(healthRes);
        setPipeline(pipelineRes);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // --- Error state ---
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Onboarding Overview</p>
        </div>
        <Card className="bg-white border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Failed to load dashboard</p>
                <p className="text-sm text-red-500 mt-1">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Onboarding Overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : stats ? (
          <>
            {/* Active Projects */}
            <Card className="bg-white">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Active Projects</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {stats.active_projects}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-[#00c9e3]/10 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-[#00c9e3]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Avg Completion */}
            <Card className="bg-white">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Avg Completion</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1">
                        {stats.avg_completion_percent}%
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                  <Progress value={stats.avg_completion_percent} className="h-1.5" />
                </div>
              </CardContent>
            </Card>

            {/* Avg Days to Complete */}
            <Card className="bg-white">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Avg Days to Complete</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {stats.avg_completion_days !== null
                        ? stats.avg_completion_days
                        : '\u2014'}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Overdue Tasks */}
            <Card className="bg-white">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Overdue Tasks</p>
                    <p
                      className={`text-3xl font-bold mt-1 ${
                        stats.overdue_tasks > 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {stats.overdue_tasks}
                    </p>
                  </div>
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      stats.overdue_tasks > 0
                        ? 'bg-red-500/10'
                        : 'bg-gray-100'
                    }`}
                  >
                    <AlertTriangle
                      className={`h-5 w-5 ${
                        stats.overdue_tasks > 0 ? 'text-red-600' : 'text-gray-400'
                      }`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pending Signatures */}
            <Card className="bg-white">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Pending Signatures</p>
                    <p
                      className={`text-3xl font-bold mt-1 ${
                        stats.pending_signatures > 0 ? 'text-amber-600' : 'text-gray-900'
                      }`}
                    >
                      {stats.pending_signatures}
                    </p>
                  </div>
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      stats.pending_signatures > 0
                        ? 'bg-amber-500/10'
                        : 'bg-gray-100'
                    }`}
                  >
                    <FileSignature
                      className={`h-5 w-5 ${
                        stats.pending_signatures > 0 ? 'text-amber-600' : 'text-gray-400'
                      }`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Project Pipeline */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#00c9e3]" />
            Project Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="animate-pulse flex gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 w-28 bg-gray-100 rounded-full" />
              ))}
            </div>
          ) : pipeline ? (
            <div className="flex flex-wrap gap-3">
              {(
                Object.entries(pipeline.by_status) as [string, number][]
              ).map(([status, count]) => (
                <Badge
                  key={status}
                  variant="outline"
                  className={`${STATUS_COLORS[status] || ''} text-sm px-3 py-1.5`}
                >
                  {STATUS_LABELS[status] || status}: {count}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Project Health Table */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-[#00c9e3]" />
            Project Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton />
          ) : healthData && healthData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Community</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Days Active</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {healthData.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium text-gray-900">
                      {project.name}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {project.community_name || '\u2014'}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {project.assigned_staff_email
                        ? project.assigned_staff_email.split('@')[0]
                        : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <Progress
                          value={project.progress}
                          className="h-2 flex-1"
                        />
                        <span className="text-sm text-gray-600 tabular-nums w-10 text-right">
                          {project.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-gray-600">
                      {project.days_active}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          project.overdue_count > 0
                            ? 'text-red-600 font-medium'
                            : 'text-gray-600'
                        }
                      >
                        {project.overdue_count}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={healthBadgeClass(project.health)}
                      >
                        {healthLabel(project.health)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <FolderOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No active projects</p>
              <p className="text-sm text-gray-400 mt-1">
                Create a project to see health metrics here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      {!loading && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Pending Uploads</p>
                  <p className="text-xl font-bold text-gray-900">{stats.pending_uploads}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <ListTodo className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Pending Tasks</p>
                  <p className="text-xl font-bold text-gray-900">{stats.pending_tasks}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-[#00c9e3]/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-[#00c9e3]" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Projects</p>
                  <p className="text-xl font-bold text-gray-900">{stats.total_projects}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
