-- Migration: 002_stages_tags_duedates.sql
-- Phase 2: Stages, Tags, Due Dates, and Automations
-- Created: 2026-02-16

BEGIN;

-- =====================================================
-- NEW TABLE: onboarding_stages
-- Groups tasks into phases (template-level or project-level)
-- =====================================================
CREATE TABLE onboarding_stages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID REFERENCES onboarding_templates(id) ON DELETE CASCADE,
    project_id UUID REFERENCES onboarding_projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT onboarding_stages_parent_check CHECK (
        (template_id IS NOT NULL AND project_id IS NULL) OR
        (template_id IS NULL AND project_id IS NOT NULL)
    )
);

COMMENT ON TABLE onboarding_stages IS 'Organizes tasks into phases/stages, can be template-level or project-specific';
COMMENT ON COLUMN onboarding_stages.template_id IS 'FK to template (for reusable stage definitions)';
COMMENT ON COLUMN onboarding_stages.project_id IS 'FK to project (for project-specific stages)';
COMMENT ON COLUMN onboarding_stages.order_index IS 'Display order within template/project';

-- =====================================================
-- NEW TABLE: onboarding_tags
-- Color-coded labels for projects
-- =====================================================
CREATE TABLE onboarding_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6B7280',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT onboarding_tags_color_format CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

COMMENT ON TABLE onboarding_tags IS 'Reusable color-coded labels for organizing projects';
COMMENT ON COLUMN onboarding_tags.color IS 'Hex color code (e.g., #EF4444)';

-- =====================================================
-- NEW TABLE: onboarding_project_tags
-- Many-to-many junction for projects and tags
-- =====================================================
CREATE TABLE onboarding_project_tags (
    project_id UUID NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES onboarding_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, tag_id)
);

COMMENT ON TABLE onboarding_project_tags IS 'Junction table linking projects to tags';

-- =====================================================
-- NEW TABLE: onboarding_automations
-- Trigger→action rules on templates
-- =====================================================
CREATE TABLE onboarding_automations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'task_completed',
        'stage_completed',
        'project_created',
        'file_uploaded',
        'signature_signed'
    )),
    trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_type TEXT NOT NULL CHECK (action_type IN (
        'activate_task',
        'complete_task',
        'activate_stage',
        'complete_stage',
        'send_email',
        'update_project_status'
    )),
    action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT onboarding_automations_delay_positive CHECK (delay_minutes >= 0)
);

COMMENT ON TABLE onboarding_automations IS 'Automation rules that execute when template events occur';
COMMENT ON COLUMN onboarding_automations.trigger_type IS 'What event triggers this automation';
COMMENT ON COLUMN onboarding_automations.trigger_config IS 'JSON config for trigger (e.g., {task_id: "uuid", stage_id: "uuid"})';
COMMENT ON COLUMN onboarding_automations.action_type IS 'What action to perform';
COMMENT ON COLUMN onboarding_automations.action_config IS 'JSON config for action (e.g., {task_id: "uuid", email_template: "client_invite"})';
COMMENT ON COLUMN onboarding_automations.delay_minutes IS 'Delay before executing action (0 = immediate)';
COMMENT ON COLUMN onboarding_automations.order_index IS 'Execution order when multiple automations trigger';

-- =====================================================
-- NEW TABLE: onboarding_automation_log
-- Execution history for automations
-- =====================================================
CREATE TABLE onboarding_automation_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    automation_id UUID NOT NULL REFERENCES onboarding_automations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
    trigger_event JSONB,
    action_result JSONB,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE onboarding_automation_log IS 'Audit trail of automation executions';
COMMENT ON COLUMN onboarding_automation_log.trigger_event IS 'JSON snapshot of trigger event data';
COMMENT ON COLUMN onboarding_automation_log.action_result IS 'JSON snapshot of action result';

-- =====================================================
-- NEW TABLE: onboarding_email_log
-- Email send tracking
-- =====================================================
CREATE TABLE onboarding_email_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES onboarding_projects(id) ON DELETE SET NULL,
    template_type TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    resend_id TEXT,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')),
    error_message TEXT,
    metadata JSONB,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE onboarding_email_log IS 'Tracks all emails sent from the onboarding system';
COMMENT ON COLUMN onboarding_email_log.template_type IS 'Email template identifier (e.g., client_invite, task_reminder)';
COMMENT ON COLUMN onboarding_email_log.resend_id IS 'Resend API response ID for tracking delivery';
COMMENT ON COLUMN onboarding_email_log.metadata IS 'Additional data (task_id, automation_id, etc.)';

-- =====================================================
-- ALTER EXISTING TABLES
-- =====================================================

-- Add stage, due date, and checklist to onboarding_tasks
ALTER TABLE onboarding_tasks
    ADD COLUMN due_date DATE,
    ADD COLUMN stage_id UUID REFERENCES onboarding_stages(id) ON DELETE SET NULL,
    ADD COLUMN checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN due_date_reminder BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN onboarding_tasks.due_date IS 'When task should be completed';
COMMENT ON COLUMN onboarding_tasks.stage_id IS 'FK to stage this task belongs to';
COMMENT ON COLUMN onboarding_tasks.checklist IS 'Array of {id: string, text: string, completed: boolean}';
COMMENT ON COLUMN onboarding_tasks.due_date_reminder IS 'Whether due date reminder has been sent';

-- Add stage and due date offset to onboarding_template_tasks
ALTER TABLE onboarding_template_tasks
    ADD COLUMN stage_id UUID REFERENCES onboarding_stages(id) ON DELETE SET NULL,
    ADD COLUMN due_days_offset INTEGER;

COMMENT ON COLUMN onboarding_template_tasks.stage_id IS 'FK to template stage this task belongs to';
COMMENT ON COLUMN onboarding_template_tasks.due_days_offset IS 'Days from management_start_date to set due_date (NULL = no due date)';

-- Add notes field to onboarding_projects
ALTER TABLE onboarding_projects
    ADD COLUMN notes TEXT;

COMMENT ON COLUMN onboarding_projects.notes IS 'Internal staff notes about this project';

-- =====================================================
-- INDEXES
-- =====================================================

-- onboarding_stages indexes
CREATE INDEX idx_onboarding_stages_template ON onboarding_stages(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX idx_onboarding_stages_project ON onboarding_stages(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_onboarding_stages_order ON onboarding_stages(order_index);

-- onboarding_tasks new column indexes
CREATE INDEX idx_onboarding_tasks_stage ON onboarding_tasks(stage_id) WHERE stage_id IS NOT NULL;
CREATE INDEX idx_onboarding_tasks_due_date ON onboarding_tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_onboarding_tasks_due_reminder ON onboarding_tasks(due_date_reminder, due_date) WHERE due_date IS NOT NULL;

-- onboarding_template_tasks new column indexes
CREATE INDEX idx_onboarding_template_tasks_stage ON onboarding_template_tasks(stage_id) WHERE stage_id IS NOT NULL;

-- onboarding_automations indexes
CREATE INDEX idx_onboarding_automations_template ON onboarding_automations(template_id);
CREATE INDEX idx_onboarding_automations_active ON onboarding_automations(is_active) WHERE is_active = true;
CREATE INDEX idx_onboarding_automations_trigger ON onboarding_automations(trigger_type);

-- onboarding_automation_log indexes
CREATE INDEX idx_onboarding_automation_log_project ON onboarding_automation_log(project_id);
CREATE INDEX idx_onboarding_automation_log_automation ON onboarding_automation_log(automation_id);
CREATE INDEX idx_onboarding_automation_log_status ON onboarding_automation_log(status);
CREATE INDEX idx_onboarding_automation_log_executed ON onboarding_automation_log(executed_at DESC);

-- onboarding_email_log indexes
CREATE INDEX idx_onboarding_email_log_project ON onboarding_email_log(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_onboarding_email_log_recipient ON onboarding_email_log(recipient_email);
CREATE INDEX idx_onboarding_email_log_status ON onboarding_email_log(status);
CREATE INDEX idx_onboarding_email_log_sent ON onboarding_email_log(sent_at DESC);
CREATE INDEX idx_onboarding_email_log_template ON onboarding_email_log(template_type);

-- onboarding_project_tags indexes
CREATE INDEX idx_onboarding_project_tags_tag ON onboarding_project_tags(tag_id);

-- =====================================================
-- TRIGGERS (updated_at auto-update)
-- =====================================================

-- Reuse existing trigger function from migration 001
CREATE TRIGGER trigger_onboarding_stages_updated_at
    BEFORE UPDATE ON onboarding_stages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_onboarding_automations_updated_at
    BEFORE UPDATE ON onboarding_automations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- onboarding_stages
ALTER TABLE onboarding_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to stages"
    ON onboarding_stages
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- onboarding_tags
ALTER TABLE onboarding_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to tags"
    ON onboarding_tags
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- onboarding_project_tags
ALTER TABLE onboarding_project_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to project_tags"
    ON onboarding_project_tags
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- onboarding_automations
ALTER TABLE onboarding_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to automations"
    ON onboarding_automations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- onboarding_automation_log
ALTER TABLE onboarding_automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to automation_log"
    ON onboarding_automation_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- onboarding_email_log
ALTER TABLE onboarding_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to email_log"
    ON onboarding_email_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- SEED DATA
-- Default tags
-- =====================================================

INSERT INTO onboarding_tags (name, color) VALUES
    ('Priority', '#EF4444'),      -- Red
    ('VIP', '#F59E0B'),           -- Amber
    ('New Community', '#3B82F6'), -- Blue
    ('Renewal', '#8B5CF6'),       -- Purple
    ('At Risk', '#F97316');       -- Orange

COMMIT;
