-- 006_comments.sql — Task-level comments
CREATE TABLE IF NOT EXISTS onboarding_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES onboarding_projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES onboarding_tasks(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('staff', 'client', 'system')),
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_project ON onboarding_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_task ON onboarding_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON onboarding_comments(created_at DESC);

ALTER TABLE onboarding_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_comments' AND policyname = 'service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON onboarding_comments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_comments_updated_at ON onboarding_comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON onboarding_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
