-- ============================================================
-- 008: External Signature Requests (CRM integration)
-- Standalone signature request system for documents sent
-- from CRM or other external systems. Separate from the
-- per-project onboarding_signatures table.
-- ============================================================

-- ---------------------------------------------------------
-- 1. signature_requests — inbound from CRM or other systems
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS signature_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system TEXT NOT NULL DEFAULT 'crm',
    source_ref TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'expired', 'cancelled')),
    document_title TEXT NOT NULL,
    pdf_url TEXT NOT NULL,
    pdf_storage_path TEXT,
    signed_pdf_path TEXT,
    callback_url TEXT NOT NULL,
    api_key_hash TEXT,
    metadata JSONB,
    hash_chain JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE signature_requests IS 'External signature requests from CRM or other integrations';
COMMENT ON COLUMN signature_requests.hash_chain IS 'Ordered array of {version, sha256, timestamp} entries for document integrity';
COMMENT ON COLUMN signature_requests.api_key_hash IS 'SHA-256 of the API key used to create this request, for audit trail';

-- ---------------------------------------------------------
-- 2. signature_request_signers — per-signer tokens & status
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS signature_request_signers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    sign_order INTEGER NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT false,
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'notified', 'viewed', 'signed', 'declined')),
    signed_at TIMESTAMPTZ,
    signature_type TEXT CHECK (signature_type IN ('draw', 'type')),
    signature_data TEXT,
    typed_name TEXT,
    initials TEXT,
    initials_data TEXT,
    signature_hash TEXT,
    document_hash_at_signing TEXT,
    ip_address INET,
    user_agent TEXT,
    consent_text TEXT,
    consent_text_hash TEXT,
    consent_given_at TIMESTAMPTZ,
    notified_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,
    decline_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE signature_request_signers IS 'Individual signers for an external signature request';
COMMENT ON COLUMN signature_request_signers.token_hash IS 'SHA-256 hash of the signing token sent to the signer';
COMMENT ON COLUMN signature_request_signers.document_hash_at_signing IS 'SHA-256 of the PDF at the moment of signing, proving document integrity';

-- ---------------------------------------------------------
-- 3. signature_request_audit — immutable event log
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS signature_request_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES signature_requests(id),
    signer_id UUID REFERENCES signature_request_signers(id),
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_email TEXT,
    ip_address TEXT,
    user_agent TEXT,
    document_hash TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE signature_request_audit IS 'Immutable audit log for signature request events';

-- Revoke mutation on audit table — append-only
REVOKE UPDATE, DELETE ON signature_request_audit FROM anon, authenticated;

-- ---------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------

-- signature_requests
CREATE INDEX IF NOT EXISTS idx_sigreq_status ON signature_requests(status);
CREATE INDEX IF NOT EXISTS idx_sigreq_source ON signature_requests(source_system, source_ref);
CREATE INDEX IF NOT EXISTS idx_sigreq_expires ON signature_requests(expires_at) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_sigreq_created ON signature_requests(created_at DESC);

-- signature_request_signers
CREATE INDEX IF NOT EXISTS idx_sigreq_signers_request ON signature_request_signers(request_id);
CREATE INDEX IF NOT EXISTS idx_sigreq_signers_email ON signature_request_signers(email);
CREATE INDEX IF NOT EXISTS idx_sigreq_signers_token ON signature_request_signers(token_hash);
CREATE INDEX IF NOT EXISTS idx_sigreq_signers_status ON signature_request_signers(request_id, status);

-- signature_request_audit
CREATE INDEX IF NOT EXISTS idx_sigreq_audit_request ON signature_request_audit(request_id);
CREATE INDEX IF NOT EXISTS idx_sigreq_audit_signer ON signature_request_audit(signer_id);
CREATE INDEX IF NOT EXISTS idx_sigreq_audit_created ON signature_request_audit(created_at DESC);

-- ---------------------------------------------------------
-- 5. Row-Level Security
-- ---------------------------------------------------------

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_request_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_request_audit ENABLE ROW LEVEL SECURITY;

-- service_role: full access to all tables
CREATE POLICY "service_role_full_access_signature_requests"
    ON signature_requests FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access_signature_request_signers"
    ON signature_request_signers FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access_signature_request_audit"
    ON signature_request_audit FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- anon: SELECT only on signature_requests (portal token validation)
CREATE POLICY "anon_select_signature_requests"
    ON signature_requests FOR SELECT
    USING (auth.role() = 'anon');

-- anon: SELECT on signers (needed for signing page to load signer info)
CREATE POLICY "anon_select_signature_request_signers"
    ON signature_request_signers FOR SELECT
    USING (auth.role() = 'anon');

-- ---------------------------------------------------------
-- 6. Storage bucket for signed agreements
-- ---------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'signed-agreements',
    'signed-agreements',
    false,
    52428800, -- 50MB
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: service_role can read/write, no public access
CREATE POLICY "service_role_signed_agreements_select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'signed-agreements' AND auth.role() = 'service_role');

CREATE POLICY "service_role_signed_agreements_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'signed-agreements' AND auth.role() = 'service_role');

CREATE POLICY "service_role_signed_agreements_update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'signed-agreements' AND auth.role() = 'service_role')
    WITH CHECK (bucket_id = 'signed-agreements' AND auth.role() = 'service_role');

CREATE POLICY "service_role_signed_agreements_delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'signed-agreements' AND auth.role() = 'service_role');
