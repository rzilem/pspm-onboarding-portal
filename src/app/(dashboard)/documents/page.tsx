'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { Document } from '@/lib/types';

function getApiKey(): string {
  if (typeof window !== 'undefined') return sessionStorage.getItem('admin_api_key') || '';
  return '';
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/documents', { headers: { 'X-API-Key': getApiKey() } });
        if (res.ok) setDocuments(await res.json());
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Library</h1>
        <p className="text-sm text-gray-500 mt-1">PDF templates for client signatures</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : documents.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">No documents yet</h3>
          <p className="text-sm text-gray-500 mt-1">
            Upload PDF templates for agreements and disclosures
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{doc.name}</p>
                  {doc.description && (
                    <p className="text-sm text-gray-500 line-clamp-1">{doc.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{doc.category}</Badge>
                {doc.requires_signature && <Badge variant="outline" className="text-amber-600">Requires Signature</Badge>}
                {!doc.is_active && <Badge variant="outline" className="text-gray-400">Inactive</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
