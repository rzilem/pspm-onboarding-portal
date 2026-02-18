// ============================================================
// PSPM Onboarding Portal — Shared Types
// ============================================================

// --- Templates ---

export interface Template {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  estimated_days: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  tasks?: TemplateTask[];
}

export interface TemplateTask {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  order_index: number;
  visibility: 'internal' | 'external';
  assignee_type: 'staff' | 'client';
  category: TaskCategory;
  requires_file_upload: boolean;
  requires_signature: boolean;
  depends_on: string | null;
  stage_id: string | null;
  due_days_offset: number | null;
  created_at: string;
}

// --- Projects ---

export interface Project {
  id: string;
  name: string;
  template_id: string | null;
  source_deal_id: string | null;
  source_deal_name: string | null;
  client_company_name: string | null;
  client_contact_name: string | null;
  client_contact_email: string | null;
  client_contact_phone: string | null;
  community_name: string | null;
  total_units: number | null;
  management_start_date: string | null;
  public_token: string;
  status: ProjectStatus;
  assigned_staff_email: string | null;
  started_at: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

// --- Tasks ---

export interface Task {
  id: string;
  project_id: string;
  template_task_id: string | null;
  title: string;
  description: string | null;
  order_index: number;
  visibility: 'internal' | 'external';
  assignee_type: 'staff' | 'client';
  assignee_email: string | null;
  category: TaskCategory;
  requires_file_upload: boolean;
  requires_signature: boolean;
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  depends_on: string | null;
  staff_notes: string | null;
  client_notes: string | null;
  due_date: string | null;
  stage_id: string | null;
  checklist: ChecklistItem[];
  due_date_reminder: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'waiting_client' | 'completed' | 'skipped';
export type TaskCategory = 'documents' | 'setup' | 'signatures' | 'review' | 'financial' | 'communication';

// --- Files ---

export interface OnboardingFile {
  id: string;
  project_id: string;
  task_id: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_by_type: 'client' | 'staff';
  category: string | null;
  description: string | null;
  created_at: string;
}

// --- Documents (templates for signing) ---

export interface Document {
  id: string;
  name: string;
  description: string | null;
  template_url: string | null;
  category: 'agreement' | 'disclosure' | 'authorization';
  requires_signature: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Signatures ---

export interface Signature {
  id: string;
  project_id: string;
  task_id: string | null;
  document_id: string | null;
  signer_name: string;
  signer_email: string | null;
  signer_title: string | null;
  signer_company: string | null;
  signature_type: 'draw' | 'type' | null;
  signature_data: string | null;
  typed_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  consent_text: string | null;
  consent_given_at: string | null;
  document_hash: string | null;
  signed_pdf_path: string | null;
  status: SignatureStatus;
  sign_token: string;
  requested_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
}

export type SignatureStatus = 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';

// --- Signature Audit ---

export interface SignatureAudit {
  id: string;
  signature_id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// --- Activity Log ---

export interface ActivityLog {
  id: string;
  project_id: string;
  task_id: string | null;
  actor: string | null;
  actor_type: 'staff' | 'client' | 'system';
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// --- Comments ---

export interface Comment {
  id: string;
  project_id: string;
  task_id: string;
  author_email: string;
  author_name: string;
  author_type: 'staff' | 'client' | 'system';
  content: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

// --- Stages ---

export interface Stage {
  id: string;
  template_id: string | null;
  project_id: string | null;
  name: string;
  description: string | null;
  order_index: number;
  status: StageStatus;
  created_at: string;
  updated_at: string;
}

export type StageStatus = 'pending' | 'active' | 'completed' | 'archived';

// --- Tags ---

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface ProjectTag {
  project_id: string;
  tag_id: string;
}

// --- Checklist ---

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

// --- Automations ---

export interface Automation {
  id: string;
  template_id: string;
  name: string;
  is_active: boolean;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  delay_minutes: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export type AutomationTriggerType = 'task_completed' | 'stage_completed' | 'project_created' | 'file_uploaded' | 'signature_signed';
export type AutomationActionType = 'activate_task' | 'complete_task' | 'activate_stage' | 'complete_stage' | 'send_email' | 'update_project_status';

// --- Automation Log ---

export interface AutomationLog {
  id: string;
  automation_id: string;
  project_id: string;
  trigger_event: Record<string, unknown> | null;
  action_result: Record<string, unknown> | null;
  status: 'success' | 'failed' | 'skipped';
  error_message: string | null;
  executed_at: string;
}

// --- Email Log ---

export interface EmailLog {
  id: string;
  project_id: string | null;
  template_type: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  resend_id: string | null;
  status: 'sent' | 'delivered' | 'failed' | 'bounced';
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: string;
}

// --- API Responses ---

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  community_name: string | null;
  client_contact_name: string | null;
  assigned_staff_email: string | null;
  progress: number; // 0-100
  total_tasks: number;
  completed_tasks: number;
  days_active: number | null;
  tags: Tag[];
  overdue_tasks: number;
  created_at: string;
}

export interface PortalView {
  project: Pick<
    Project,
    'id' | 'name' | 'status' | 'community_name' | 'client_company_name' | 'client_contact_name' | 'management_start_date'
  >;
  tasks: Array<
    Pick<Task, 'id' | 'title' | 'description' | 'category' | 'status' | 'requires_file_upload' | 'requires_signature' | 'client_notes' | 'order_index' | 'due_date' | 'stage_id' | 'checklist'>
  >;
  stages: Array<Pick<Stage, 'id' | 'name' | 'order_index' | 'status'> & { total_tasks: number; completed_tasks: number }>;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  signatures: Array<Pick<Signature, 'id' | 'status' | 'signer_name' | 'document_id' | 'task_id' | 'signed_at'> & { document_name: string | null }>;
  files: Array<Pick<OnboardingFile, 'id' | 'file_name' | 'task_id' | 'created_at'>>;
}

export interface DashboardStats {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  avg_completion_days: number | null;
  pending_signatures: number;
  pending_uploads: number;
  overdue_tasks: number;
  pending_tasks: number;
  avg_completion_percent: number;
}

export interface CrmSignatureDetail {
  id: string;
  signer_name: string;
  document_name: string | null;
  status: SignatureStatus;
}

export interface CrmProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  days_active: number | null;
  next_action: string | null;
  portal_url: string;
  total_tasks: number;
  completed_tasks: number;
  pending_signatures: number;
  signatures: CrmSignatureDetail[];
}

export interface ClientSummary {
  email: string;
  name: string | null;
  phone: string | null;
  community: string | null;
  project_count: number;
  active_count: number;
  completed_count: number;
  last_activity: string | null;
  projects: Array<{
    id: string;
    name: string;
    status: ProjectStatus;
    progress: number;
  }>;
}
