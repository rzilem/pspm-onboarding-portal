import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/supabase';
import { validatePortalToken } from '@/lib/auth';
import type { Signature, Document } from '@/lib/types';

/**
 * GET /api/portal/[token]/signatures
 * List all signatures for this project (all statuses so client sees full picture).
 * Includes document_name joined from onboarding_documents.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const project = await validatePortalToken(token);
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired portal link' }, { status: 404 });
  }

  try {
    const signatures = await supabaseRest<Signature[]>(
      `onboarding_signatures?project_id=eq.${project.id}&order=requested_at.asc`,
    );

    // Join document names
    const docIds = [...new Set(signatures.filter((s) => s.document_id).map((s) => s.document_id!))];
    const docMap = new Map<string, string>();
    if (docIds.length > 0) {
      const docs = await supabaseRest<Document[]>(
        `onboarding_documents?id=in.(${docIds.join(',')})\&select=id,name`,
      );
      for (const doc of docs) {
        docMap.set(doc.id, doc.name);
      }
    }

    const enriched = signatures.map((s) => ({
      ...s,
      document_name: s.document_id ? docMap.get(s.document_id) || null : null,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[portal/signatures] Failed to list signatures:', err);
    return NextResponse.json({ error: 'Failed to list signatures' }, { status: 500 });
  }
}
