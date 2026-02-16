'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, LayoutTemplate, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Template } from '@/lib/types';

function getApiKey(): string {
  if (typeof window !== 'undefined') return sessionStorage.getItem('admin_api_key') || '';
  return '';
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/templates', { headers: { 'X-API-Key': getApiKey() } });
        if (res.ok) setTemplates(await res.json());
      } catch (err) {
        console.error('Failed to load templates:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable project blueprints with predefined tasks</p>
        </div>
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
          {templates.map((t) => (
            <Link key={t.id} href={`/templates/${t.id}`}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{t.name}</h3>
                      {!t.is_active && <Badge variant="outline" className="text-gray-400">Inactive</Badge>}
                    </div>
                    {t.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">{t.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {t.estimated_days ? `${t.estimated_days} days estimated` : 'No estimate'}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
