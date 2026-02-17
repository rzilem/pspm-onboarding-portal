'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Upload, FileText, CheckCircle2, Loader2, ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/gif',
];

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const taskId = params.taskId as string;

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(f: File) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error('File type not allowed. Use PDF, Word, Excel, or images.');
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error('File too large. Max 50MB.');
      return;
    }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('task_id', taskId);

      const res = await fetch(`/api/portal/${token}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      setUploaded(true);
      toast.success('File uploaded successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (uploaded) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">File Uploaded</h2>
          <p className="text-sm text-gray-500 mt-2">
            Your file has been received. Thank you!
          </p>
          <Button
            onClick={() => router.push(`/p/${token}`)}
            className="mt-6 bg-[#00c9e3] hover:bg-[#00b0c8]"
          >
            Back to Portal
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/p/${token}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Portal
        </Button>

        <Card
          className={`p-12 text-center border-2 border-dashed transition-colors cursor-pointer ${
            dragOver ? 'border-[#00c9e3] bg-[#00c9e3]/5' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-700">
            {dragOver ? 'Drop file here' : 'Drag & drop your file here'}
          </p>
          <p className="text-sm text-gray-500 mt-1">or click to browse</p>
          <p className="text-xs text-gray-400 mt-3">
            PDF, Word, Excel, or images · Max 50MB
          </p>
        </Card>

        {file && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  onClick={upload}
                  disabled={uploading}
                  className="bg-[#00c9e3] hover:bg-[#00b0c8]"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  Upload
                </Button>
              </div>
            </div>
          </Card>
        )}
    </div>
  );
}
