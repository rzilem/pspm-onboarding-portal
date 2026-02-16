import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest, supabaseStorageUpload } from '@/lib/supabase';
import type { Document } from '@/lib/types';

/**
 * POST /api/documents/upload — Upload a PDF document template
 * Expects multipart/form-data with:
 * - file: PDF file (max 50MB)
 * - name: Document name
 * - description: Optional description
 * - category: 'agreement' | 'disclosure' | 'authorization'
 * - requires_signature: 'true' | 'false'
 */
export async function POST(req: NextRequest) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    // Parse multipart form data
    const formData = await req.formData();

    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string | null;
    const description = formData.get('description') as string | null;
    const category = formData.get('category') as string | null;
    const requiresSignature = formData.get('requires_signature') as string | null;

    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File must be under 50MB' }, { status: 400 });
    }

    // Validate name
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Document name is required' }, { status: 400 });
    }

    // Validate category
    const validCategories = ['agreement', 'disclosure', 'authorization'];
    const finalCategory = category && validCategories.includes(category) ? category : 'agreement';

    // Generate UUID for storage path
    const uuid = randomUUID();

    // Sanitize filename (remove special chars, keep alphanumeric + dash + underscore + dot)
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const storagePath = `documents/${uuid}/${sanitizedFilename}`;

    const { path: fullPath } = await supabaseStorageUpload(
      'onboarding-files',
      storagePath,
      new Uint8Array(fileBuffer),
      'application/pdf',
    );

    // Create document record in database
    const documentPayload = {
      name: name.trim(),
      description: description?.trim() || null,
      template_url: fullPath,
      category: finalCategory,
      requires_signature: requiresSignature === 'true',
      is_active: true,
    };

    const [created] = await supabaseRest<Document[]>('onboarding_documents', {
      method: 'POST',
      body: JSON.stringify(documentPayload),
      prefer: 'return=representation',
    });

    console.log('[api/documents/upload] Document uploaded:', {
      id: created.id,
      name: created.name,
      category: created.category,
      path: fullPath,
      size: file.size,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/documents/upload] Upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
