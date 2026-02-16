import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';
import { supabaseRest } from '@/lib/supabase';
import type { Document } from '@/lib/types';

/**
 * GET /api/documents/[id] — Get a single document by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const [document] = await supabaseRest<Document[]>(
      `onboarding_documents?id=eq.${id}&select=*`,
    );

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (err) {
    console.error('[api/documents/[id]] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/documents/[id] — Update document metadata
 * Accepts: name, description, category, requires_signature, is_active
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();

    const { name, description, category, requires_signature, is_active } = body;

    // Build update payload (only include provided fields)
    const updatePayload: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      updatePayload.name = name.trim();
    }

    if (description !== undefined) {
      updatePayload.description = description?.trim() || null;
    }

    if (category !== undefined) {
      const validCategories = ['agreement', 'disclosure', 'authorization'];
      if (!validCategories.includes(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      updatePayload.category = category;
    }

    if (requires_signature !== undefined) {
      updatePayload.requires_signature = !!requires_signature;
    }

    if (is_active !== undefined) {
      updatePayload.is_active = !!is_active;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const [updated] = await supabaseRest<Document[]>(`onboarding_documents?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updatePayload),
      prefer: 'return=representation',
    });

    if (!updated) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    console.log('[api/documents/[id]] Document updated:', {
      id: updated.id,
      fields: Object.keys(updatePayload),
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[api/documents/[id]] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/documents/[id] — Soft-delete a document (set is_active=false)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = validateApiKey(req);
  if (authError) return authError;

  try {
    const { id } = await params;

    const [updated] = await supabaseRest<Document[]>(`onboarding_documents?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
      prefer: 'return=representation',
    });

    if (!updated) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    console.log('[api/documents/[id]] Document soft-deleted:', { id: updated.id });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/documents/[id]] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
