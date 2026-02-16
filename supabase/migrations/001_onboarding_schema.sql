-- =============================================================================
-- PSPM Onboarding Portal — Complete Schema Migration
-- =============================================================================
-- Tables:          9 (templates, template_tasks, projects, tasks, files,
--                     documents, signatures, signature_audit, activity_log)
-- Storage:         1 bucket (onboarding-files)
-- Triggers:        5 (4 updated_at + 1 public_token auto-gen)
-- RLS Policies:    service_role full access on all tables + anon SELECT on projects
-- Seed Data:       1 template + 28 tasks ("New HOA Community Onboarding")
-- =============================================================================

-- Enable pgcrypto for extensions.gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. UTILITY: Shared updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ===========================================================================
-- 1. onboarding_templates — Reusable project blueprints
-- ===========================================================================
CREATE TABLE onboarding_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    is_active       BOOLEAN DEFAULT true,
    estimated_days  INTEGER,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_templates
    FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_onboarding_templates_updated_at
    BEFORE UPDATE ON onboarding_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ===========================================================================
-- 2. onboarding_template_tasks — Tasks within a template
-- ===========================================================================
CREATE TABLE onboarding_template_tasks (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id          UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    description          TEXT,
    order_index          INTEGER NOT NULL DEFAULT 0,
    visibility           TEXT NOT NULL DEFAULT 'external'
                             CHECK (visibility IN ('internal', 'external')),
    assignee_type        TEXT NOT NULL DEFAULT 'client'
                             CHECK (assignee_type IN ('staff', 'client')),
    category             TEXT NOT NULL DEFAULT 'setup'
                             CHECK (category IN ('documents', 'setup', 'signatures',
                                                 'review', 'financial', 'communication')),
    requires_file_upload BOOLEAN DEFAULT false,
    requires_signature   BOOLEAN DEFAULT false,
    depends_on           UUID REFERENCES onboarding_template_tasks(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_template_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_template_tasks
    FOR ALL USING (auth.role() = 'service_role');


-- ===========================================================================
-- 3. onboarding_projects — Active onboarding instances
-- ===========================================================================
CREATE TABLE onboarding_projects (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   TEXT NOT NULL,
    template_id            UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL,
    source_deal_id         UUID,
    source_deal_name       TEXT,
    client_company_name    TEXT,
    client_contact_name    TEXT,
    client_contact_email   TEXT,
    client_contact_phone   TEXT,
    community_name         TEXT,
    total_units            INTEGER,
    management_start_date  DATE,
    public_token           TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
    status                 TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'active', 'paused',
                                                 'completed', 'cancelled')),
    assigned_staff_email   TEXT,
    started_at             TIMESTAMPTZ,
    target_completion_date DATE,
    completed_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_projects
    FOR ALL USING (auth.role() = 'service_role');

-- Anon can SELECT (portal validates token in app layer)
CREATE POLICY "anon_select_projects" ON onboarding_projects
    FOR SELECT TO anon USING (true);

CREATE TRIGGER trg_onboarding_projects_updated_at
    BEFORE UPDATE ON onboarding_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate public_token on INSERT if not supplied
-- (The DEFAULT handles most cases; this trigger is a safety net that also
--  regenerates if someone accidentally inserts a NULL.)
CREATE OR REPLACE FUNCTION generate_public_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.public_token IS NULL OR NEW.public_token = '' THEN
        NEW.public_token := encode(extensions.gen_random_bytes(16), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_onboarding_projects_public_token
    BEFORE INSERT ON onboarding_projects
    FOR EACH ROW EXECUTE FUNCTION generate_public_token();

-- Indexes
CREATE INDEX idx_onboarding_projects_public_token   ON onboarding_projects (public_token);
CREATE INDEX idx_onboarding_projects_source_deal_id ON onboarding_projects (source_deal_id);
CREATE INDEX idx_onboarding_projects_status         ON onboarding_projects (status);
CREATE INDEX idx_onboarding_projects_community_name ON onboarding_projects (community_name);


-- ===========================================================================
-- 4. onboarding_tasks — Actual tasks in a project
-- ===========================================================================
CREATE TABLE onboarding_tasks (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
    template_task_id     UUID REFERENCES onboarding_template_tasks(id) ON DELETE SET NULL,
    title                TEXT NOT NULL,
    description          TEXT,
    order_index          INTEGER NOT NULL DEFAULT 0,
    visibility           TEXT NOT NULL DEFAULT 'external'
                             CHECK (visibility IN ('internal', 'external')),
    assignee_type        TEXT NOT NULL DEFAULT 'client'
                             CHECK (assignee_type IN ('staff', 'client')),
    assignee_email       TEXT,
    category             TEXT NOT NULL DEFAULT 'setup'
                             CHECK (category IN ('documents', 'setup', 'signatures',
                                                 'review', 'financial', 'communication')),
    requires_file_upload BOOLEAN DEFAULT false,
    requires_signature   BOOLEAN DEFAULT false,
    status               TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress',
                                               'waiting_client', 'completed', 'skipped')),
    completed_at         TIMESTAMPTZ,
    completed_by         TEXT,
    depends_on           UUID REFERENCES onboarding_tasks(id) ON DELETE SET NULL,
    staff_notes          TEXT,
    client_notes         TEXT,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_tasks
    FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_onboarding_tasks_updated_at
    BEFORE UPDATE ON onboarding_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_onboarding_tasks_project_order  ON onboarding_tasks (project_id, order_index);
CREATE INDEX idx_onboarding_tasks_project_status ON onboarding_tasks (project_id, status);


-- ===========================================================================
-- 5. onboarding_files — Client uploads + staff uploads
-- ===========================================================================
CREATE TABLE onboarding_files (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
    task_id          UUID REFERENCES onboarding_tasks(id) ON DELETE SET NULL,
    file_name        TEXT NOT NULL,
    file_type        TEXT,
    file_size        INTEGER,
    storage_path     TEXT NOT NULL,
    uploaded_by      TEXT,
    uploaded_by_type TEXT NOT NULL DEFAULT 'client'
                         CHECK (uploaded_by_type IN ('client', 'staff')),
    category         TEXT,
    description      TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_files
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_onboarding_files_project_id ON onboarding_files (project_id);
CREATE INDEX idx_onboarding_files_task_id    ON onboarding_files (task_id);


-- ===========================================================================
-- 6. onboarding_documents — PDF templates for signing
-- ===========================================================================
CREATE TABLE onboarding_documents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    description        TEXT,
    template_url       TEXT,
    category           TEXT NOT NULL DEFAULT 'agreement'
                           CHECK (category IN ('agreement', 'disclosure', 'authorization')),
    requires_signature BOOLEAN DEFAULT true,
    is_active          BOOLEAN DEFAULT true,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_documents
    FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER trg_onboarding_documents_updated_at
    BEFORE UPDATE ON onboarding_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ===========================================================================
-- 7. onboarding_signatures — Individual signature records (ESIGN-compliant)
-- ===========================================================================
CREATE TABLE onboarding_signatures (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
    task_id          UUID REFERENCES onboarding_tasks(id) ON DELETE SET NULL,
    document_id      UUID REFERENCES onboarding_documents(id) ON DELETE SET NULL,
    signer_name      TEXT NOT NULL,
    signer_email     TEXT,
    signer_title     TEXT,
    signer_company   TEXT,
    signature_type   TEXT CHECK (signature_type IN ('draw', 'type')),
    signature_data   TEXT,                          -- Base64 PNG
    typed_name       TEXT,
    ip_address       INET,
    user_agent       TEXT,
    consent_text     TEXT,
    consent_given_at TIMESTAMPTZ,
    document_hash    TEXT,                          -- SHA-256
    signed_pdf_path  TEXT,
    status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sent', 'viewed',
                                           'signed', 'declined')),
    sign_token       TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
    requested_at     TIMESTAMPTZ DEFAULT now(),
    viewed_at        TIMESTAMPTZ,
    signed_at        TIMESTAMPTZ,
    declined_at      TIMESTAMPTZ,
    decline_reason   TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_signatures
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_onboarding_signatures_project_id ON onboarding_signatures (project_id);
CREATE INDEX idx_onboarding_signatures_sign_token  ON onboarding_signatures (sign_token);
CREATE INDEX idx_onboarding_signatures_status      ON onboarding_signatures (status);


-- ===========================================================================
-- 8. onboarding_signature_audit — Immutable event log per signature
-- ===========================================================================
CREATE TABLE onboarding_signature_audit (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_id UUID NOT NULL REFERENCES onboarding_signatures(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    event_data   JSONB,
    ip_address   INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_signature_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_signature_audit
    FOR ALL USING (auth.role() = 'service_role');

-- Index
CREATE INDEX idx_onboarding_signature_audit_sig_created
    ON onboarding_signature_audit (signature_id, created_at DESC);


-- ===========================================================================
-- 9. onboarding_activity_log — All events across a project
-- ===========================================================================
CREATE TABLE onboarding_activity_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
    task_id    UUID REFERENCES onboarding_tasks(id) ON DELETE SET NULL,
    actor      TEXT,
    actor_type TEXT NOT NULL DEFAULT 'system'
                   CHECK (actor_type IN ('staff', 'client', 'system')),
    action     TEXT NOT NULL,
    details    JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE onboarding_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON onboarding_activity_log
    FOR ALL USING (auth.role() = 'service_role');

-- Index
CREATE INDEX idx_onboarding_activity_log_project_created
    ON onboarding_activity_log (project_id, created_at DESC);


-- ===========================================================================
-- 10. STORAGE BUCKET — onboarding-files
-- ===========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'onboarding-files',
    'onboarding-files',
    false,
    52428800,  -- 50 MB
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/png',
        'image/jpeg',
        'image/gif'
    ]
);

-- Storage RLS: service_role can do everything
CREATE POLICY "service_role_all_storage" ON storage.objects
    FOR ALL USING (
        bucket_id = 'onboarding-files'
        AND auth.role() = 'service_role'
    );


-- ===========================================================================
-- 11. SEED DATA — Default Template: "New HOA Community Onboarding"
-- ===========================================================================
DO $$
DECLARE
    v_template_id UUID;
BEGIN
    -- Create the template
    INSERT INTO onboarding_templates (name, description, is_active, estimated_days, created_by)
    VALUES (
        'New HOA Community Onboarding',
        'Standard onboarding checklist for new HOA communities transitioning to PS Property Management. Covers agreements, document collection, system setup, financial transition, and go-live verification.',
        true,
        45,
        'system'
    )
    RETURNING id INTO v_template_id;

    -- -----------------------------------------------------------------------
    -- Agreements & Signatures (External, Client, requires_signature = true)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, requires_signature)
    VALUES
        (v_template_id,
         'Sign Management Agreement',
         'Review and sign the property management agreement between the association and PS Property Management.',
         1, 'external', 'client', 'signatures', true),

        (v_template_id,
         'Sign Authorization to Manage Funds',
         'Authorize PS Property Management to manage association bank accounts and process financial transactions on behalf of the community.',
         2, 'external', 'client', 'signatures', true),

        (v_template_id,
         'Sign Technology Services Addendum',
         'Acknowledge and agree to the technology services provided including community website, homeowner portal, and AI communication tools.',
         3, 'external', 'client', 'signatures', true),

        (v_template_id,
         'Sign Insurance Requirements Acknowledgment',
         'Acknowledge the insurance coverage requirements and confirm that the association maintains adequate coverage.',
         4, 'external', 'client', 'signatures', true);

    -- -----------------------------------------------------------------------
    -- Document Collection (External, Client, requires_file_upload = true)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, requires_file_upload)
    VALUES
        (v_template_id,
         'Upload Certificate of Insurance',
         'Provide the current certificate of insurance for the association including general liability and directors & officers coverage.',
         5, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Governing Documents (CC&Rs, Bylaws, Articles)',
         'Upload all governing documents including the Declaration of Covenants, Conditions & Restrictions (CC&Rs), Bylaws, and Articles of Incorporation.',
         6, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Current Year Budget',
         'Provide the approved budget for the current fiscal year.',
         7, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Most Recent Financial Statements',
         'Provide the most recent financial statements including balance sheet, income statement, and bank reconciliation.',
         8, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Board Member Contact List',
         'Provide full contact information for all current board members including name, email, phone, address, and board position.',
         9, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Vendor Contract List',
         'Provide a list of all active vendor contracts including landscaping, pool maintenance, pest control, and any other recurring services.',
         10, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Reserve Study (if available)',
         'If the association has a reserve study, please upload the most recent version.',
         11, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Previous Meeting Minutes (last 12 months)',
         'Provide board meeting minutes from the last 12 months to help us understand recent decisions and ongoing projects.',
         12, 'external', 'client', 'documents', true),

        (v_template_id,
         'Upload Homeowner Directory / Roster',
         'Provide the current homeowner directory or roster including names, addresses, email addresses, and phone numbers for all homeowners.',
         13, 'external', 'client', 'documents', true);

    -- -----------------------------------------------------------------------
    -- Initial Setup (Internal, Staff)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category)
    VALUES
        (v_template_id,
         'Create community record in Vantaca',
         'Set up the new community in Vantaca management software including community details, assessment structure, and chart of accounts.',
         14, 'internal', 'staff', 'setup'),

        (v_template_id,
         'Set up SharePoint folder structure',
         'Create the standard SharePoint folder structure for the community including Governing Documents, Financial, Board, Homeowners, and Vendors folders.',
         15, 'internal', 'staff', 'setup'),

        (v_template_id,
         'Configure community in Phone AI system',
         'Add the community to the Phone AI agent configuration including community-specific knowledge base, manager assignment, and call routing rules.',
         16, 'internal', 'staff', 'setup'),

        (v_template_id,
         'Add community to Board Weekly Updates',
         'Configure the community in the Board Weekly Updates system so board members receive automated weekly management reports.',
         17, 'internal', 'staff', 'setup'),

        (v_template_id,
         'Create community website (if applicable)',
         'Build and deploy the community website using the PSPM community websites platform. Configure branding, navigation, and initial content.',
         18, 'internal', 'staff', 'setup');

    -- -----------------------------------------------------------------------
    -- Financial Transition (Internal, Staff)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category)
    VALUES
        (v_template_id,
         'Open operating bank account',
         'Open the community operating bank account at the designated financial institution. Set up online banking access and authorized signers.',
         19, 'internal', 'staff', 'financial'),

        (v_template_id,
         'Open reserve bank account',
         'Open the community reserve fund bank account. Ensure proper separation from operating funds per governing documents.',
         20, 'internal', 'staff', 'financial'),

        (v_template_id,
         'Set up assessment collection in Vantaca',
         'Configure assessment billing, coupon books or auto-pay, and payment processing in Vantaca for all homeowner accounts.',
         21, 'internal', 'staff', 'financial'),

        (v_template_id,
         'Transfer funds from previous management',
         'Coordinate the transfer of all association funds from the previous management company. Verify amounts against financial statements.',
         22, 'internal', 'staff', 'financial'),

        (v_template_id,
         'Send welcome letter with payment portal info',
         'Prepare and send welcome letters to all homeowners with information about the new management company, payment portal access, and key contacts.',
         23, 'internal', 'staff', 'communication');

    -- -----------------------------------------------------------------------
    -- Communication Setup (Internal, Staff)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category)
    VALUES
        (v_template_id,
         'Import homeowner data to Vantaca',
         'Import the complete homeowner roster into Vantaca including owner information, lot details, assessment balances, and violation history.',
         24, 'internal', 'staff', 'setup'),

        (v_template_id,
         'Send introduction email to all homeowners',
         'Send a branded introduction email to all homeowners announcing PS Property Management as the new management company with key contacts and resources.',
         25, 'internal', 'staff', 'communication'),

        (v_template_id,
         'Schedule first board meeting with PSPM',
         'Coordinate and schedule the first board meeting with PS Property Management to review the transition timeline, introduce the team, and discuss priorities.',
         26, 'internal', 'staff', 'communication');

    -- -----------------------------------------------------------------------
    -- Go-Live (Mixed)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category)
    VALUES
        (v_template_id,
         'Confirm all documents received and filed',
         'Verify that all required documents have been received from the client, reviewed for completeness, and filed in the appropriate SharePoint locations.',
         27, 'internal', 'staff', 'review'),

        (v_template_id,
         'Confirm client portal access works',
         'Verify that the board can access the client portal, view onboarding progress, and confirm that all completed items are visible and accurate.',
         28, 'external', 'client', 'review');

END $$;


-- ===========================================================================
-- MIGRATION COMPLETE
-- ===========================================================================
-- Tables created:  9
-- Triggers:        5 (4 updated_at + 1 public_token)
-- Indexes:        12
-- RLS policies:   10 (9 service_role + 1 anon SELECT)
-- Storage bucket:  1 (onboarding-files, 50MB limit)
-- Seed data:       1 template + 28 tasks
-- ===========================================================================
