'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Users, Mail, Phone, Building2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatDate, statusColor } from '@/lib/utils';
import { apiFetch } from '@/lib/hooks';
import type { ClientSummary } from '@/lib/types';

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchClients() {
      try {
        const data = await apiFetch<ClientSummary[]>('/api/clients');
        setClients(data);
      } catch (err) {
        console.error('Failed to fetch clients:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, []);

  const filtered = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.name?.toLowerCase().includes(q)) ||
      c.email.toLowerCase().includes(q) ||
      (c.community?.toLowerCase().includes(q)) ||
      (c.phone?.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Directory</h1>
          <p className="text-sm text-gray-500 mt-1">
            {clients.length} client{clients.length !== 1 ? 's' : ''} across all projects
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, email, community, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <h3 className="text-lg font-medium text-gray-900 mt-2">No clients found</h3>
          <p className="text-sm text-gray-500 mt-1">
            {search ? 'Try adjusting your search' : 'Clients will appear when projects have client contacts'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((client) => (
            <Card key={client.email} className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold text-gray-900">
                    {client.name || client.email}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {client.email}
                    </span>
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {client.phone}
                      </span>
                    )}
                    {client.community && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {client.community}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {client.active_count > 0 && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                      {client.active_count} active
                    </Badge>
                  )}
                  {client.completed_count > 0 && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                      {client.completed_count} done
                    </Badge>
                  )}
                </div>
              </div>

              {/* Project list */}
              <div className="mt-3 space-y-2">
                {client.projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 group-hover:text-[#00c9e3]">
                        {project.name}
                      </span>
                      <Badge variant="outline" className={`text-xs ${statusColor(project.status)}`}>
                        {project.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 w-32">
                      <Progress value={project.progress} className="h-1.5 flex-1" />
                      <span className="text-xs text-gray-500 w-8 text-right">{project.progress}%</span>
                    </div>
                  </Link>
                ))}
              </div>

              {client.last_activity && (
                <p className="text-xs text-gray-400 mt-2">
                  Last activity: {formatDate(client.last_activity)}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
