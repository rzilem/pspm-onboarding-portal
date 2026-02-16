'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Upload, MoreVertical, Download, Edit2, XCircle, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { getApiKey, apiFetch } from '@/lib/hooks';
import type { Document } from '@/lib/types';

type CategoryFilter = 'all' | 'agreement' | 'disclosure' | 'authorization';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCategory, setUploadCategory] = useState<'agreement' | 'disclosure' | 'authorization'>('agreement');
  const [uploadRequiresSignature, setUploadRequiresSignature] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<'agreement' | 'disclosure' | 'authorization'>('agreement');
  const [editRequiresSignature, setEditRequiresSignature] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editing, setEditing] = useState(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const docs = await apiFetch<Document[]>('/api/documents');
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  // --- Upload handlers ---

  function handleFileSelect(file: File | null) {
    setUploadFile(file);
    if (file) {
      // Auto-fill name from filename (without extension)
      const nameWithoutExt = file.name.replace(/\.pdf$/i, '');
      setUploadName(nameWithoutExt);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File must be under 50MB');
      return;
    }

    handleFileSelect(file);
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!uploadFile) {
      toast.error('Please select a file');
      return;
    }

    if (!uploadName.trim()) {
      toast.error('Please enter a document name');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadName.trim());
      formData.append('description', uploadDescription.trim());
      formData.append('category', uploadCategory);
      formData.append('requires_signature', String(uploadRequiresSignature));

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'X-API-Key': getApiKey() },
        body: formData,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        let message = `Upload failed (${res.status})`;
        try {
          const parsed = JSON.parse(errorBody);
          message = parsed.error || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const created = await res.json();

      toast.success('Document uploaded successfully');
      setDocuments((prev) => [created, ...prev]);

      // Reset form
      setUploadOpen(false);
      setUploadFile(null);
      setUploadName('');
      setUploadDescription('');
      setUploadCategory('agreement');
      setUploadRequiresSignature(true);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // --- Edit handlers ---

  function openEditDialog(doc: Document) {
    setEditDoc(doc);
    setEditName(doc.name);
    setEditDescription(doc.description || '');
    setEditCategory(doc.category);
    setEditRequiresSignature(doc.requires_signature);
    setEditIsActive(doc.is_active);
    setEditOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!editDoc) return;

    if (!editName.trim()) {
      toast.error('Please enter a document name');
      return;
    }

    setEditing(true);

    try {
      const updated = await apiFetch<Document>(`/api/documents/${editDoc.id}`, {
        method: 'PATCH',
        body: {
          name: editName.trim(),
          description: editDescription.trim(),
          category: editCategory,
          requires_signature: editRequiresSignature,
          is_active: editIsActive,
        },
      });

      toast.success('Document updated successfully');
      setDocuments((prev) => prev.map((d) => (d.id === editDoc.id ? updated : d)));

      setEditOpen(false);
      setEditDoc(null);
    } catch (err) {
      console.error('Edit error:', err);
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setEditing(false);
    }
  }

  // --- Action handlers ---

  async function handleToggleActive(doc: Document) {
    try {
      const updated = await apiFetch<Document>(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        body: { is_active: !doc.is_active },
      });

      toast.success(updated.is_active ? 'Document activated' : 'Document deactivated');
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
    } catch (err) {
      console.error('Toggle active error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update document');
    }
  }

  function handleDownload(doc: Document) {
    const url = `/api/documents/${doc.id}/download`;
    window.open(url, '_blank');
  }

  // --- Filtering ---

  const filteredDocuments =
    categoryFilter === 'all'
      ? documents
      : documents.filter((d) => d.category === categoryFilter);

  const categoryCounts = {
    all: documents.length,
    agreement: documents.filter((d) => d.category === 'agreement').length,
    disclosure: documents.filter((d) => d.category === 'disclosure').length,
    authorization: documents.filter((d) => d.category === 'authorization').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Library</h1>
          <p className="text-sm text-gray-500 mt-1">PDF templates for client signatures</p>
        </div>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#00c9e3] hover:bg-[#00b0cc] text-white">
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleUploadSubmit}>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
                <DialogDescription>
                  Upload a PDF template for client signatures. Max 50MB.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Drag-drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-[#00c9e3] bg-blue-50'
                      : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-red-500" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">{uploadFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFileSelect(null)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">
                        Drop PDF file here or click to browse
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Max 50MB</p>
                      <Input
                        type="file"
                        accept="application/pdf"
                        className="mt-3"
                        onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                      />
                    </>
                  )}
                </div>

                {/* Name */}
                <div>
                  <Label htmlFor="upload-name">Document Name</Label>
                  <Input
                    id="upload-name"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="e.g., Management Agreement"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <Label htmlFor="upload-description">Description (optional)</Label>
                  <Textarea
                    id="upload-description"
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="Brief description of this document"
                    rows={2}
                  />
                </div>

                {/* Category */}
                <div>
                  <Label htmlFor="upload-category">Category</Label>
                  <Select value={uploadCategory} onValueChange={(v: any) => setUploadCategory(v)}>
                    <SelectTrigger id="upload-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agreement">Agreement</SelectItem>
                      <SelectItem value="disclosure">Disclosure</SelectItem>
                      <SelectItem value="authorization">Authorization</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Requires Signature */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="upload-requires-signature"
                    checked={uploadRequiresSignature}
                    onCheckedChange={(checked) => setUploadRequiresSignature(!!checked)}
                  />
                  <Label
                    htmlFor="upload-requires-signature"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Requires client signature
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUploadOpen(false)}
                  disabled={uploading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!uploadFile || uploading}
                  className="bg-[#00c9e3] hover:bg-[#00b0cc] text-white"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Upload Document'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter Tabs */}
      <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
        <TabsList>
          <TabsTrigger value="all">All ({categoryCounts.all})</TabsTrigger>
          <TabsTrigger value="agreement">Agreement ({categoryCounts.agreement})</TabsTrigger>
          <TabsTrigger value="disclosure">Disclosure ({categoryCounts.disclosure})</TabsTrigger>
          <TabsTrigger value="authorization">Authorization ({categoryCounts.authorization})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Document List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium">No documents yet</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Upload your first PDF template to get started
          </p>
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-[#00c9e3] hover:bg-[#00b0cc] text-white"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                  {doc.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">{doc.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="capitalize">
                      {doc.category}
                    </Badge>
                    {doc.requires_signature && (
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        Requires Signature
                      </Badge>
                    )}
                    {!doc.is_active && (
                      <Badge variant="outline" className="text-gray-400 border-gray-300">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex-shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEditDialog(doc)}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload(doc)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleToggleActive(doc)}>
                    {doc.is_active ? (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Activate
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Document</DialogTitle>
              <DialogDescription>Update document metadata and settings</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Name */}
              <div>
                <Label htmlFor="edit-name">Document Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="edit-description">Description (optional)</Label>
                <Textarea
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Select value={editCategory} onValueChange={(v: any) => setEditCategory(v)}>
                  <SelectTrigger id="edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agreement">Agreement</SelectItem>
                    <SelectItem value="disclosure">Disclosure</SelectItem>
                    <SelectItem value="authorization">Authorization</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Requires Signature */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-requires-signature"
                  checked={editRequiresSignature}
                  onCheckedChange={(checked) => setEditRequiresSignature(!!checked)}
                />
                <Label
                  htmlFor="edit-requires-signature"
                  className="text-sm font-normal cursor-pointer"
                >
                  Requires client signature
                </Label>
              </div>

              {/* Is Active */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-is-active"
                  checked={editIsActive}
                  onCheckedChange={(checked) => setEditIsActive(!!checked)}
                />
                <Label htmlFor="edit-is-active" className="text-sm font-normal cursor-pointer">
                  Active (shown to clients)
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={editing}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={editing}
                className="bg-[#00c9e3] hover:bg-[#00b0cc] text-white"
              >
                {editing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
