# PSPM Onboarding Portal — Full Codebase Audit Report

**Date:** 2026-03-07
**Auditor:** Claude (automated deep audit)
**Branch:** `claude/audit-crm-integration-M8QZ2`

---

## Executive Summary

The PSPM Onboarding Portal is a **Next.js 16 + Supabase** application for managing HOA community onboarding workflows. It includes a staff dashboard, client portal, template/automation engine, electronic signature system, and CRM integration points.

**TypeScript compiles clean** — zero type errors. The architecture is sound and the code is well-structured. However, this audit found **8 critical bugs**, **15 significant issues**, and **18 minor issues** that need attention before production use.

---

## CRITICAL BUGS (Will break functionality)

### 1. `notify_crm` action_type missing from database CHECK constraint
- **Files:** `supabase/migrations/002_stages_tags_duedates.sql:76-83` vs `src/lib/types.ts:257` and `src/lib/automation-engine.ts:226`
- **Impact:** Any automation configured with `action_type = 'notify_crm'` will **fail with a Postgres constraint violation** when inserted into `onboarding_automations`. The TypeScript types and the automations UI both allow `notify_crm`, but the database rejects it.
- **Fix:** Add `'notify_crm'` to the CHECK constraint on `onboarding_automations.action_type`. Requires a new migration:
  ```sql
  ALTER TABLE onboarding_automations DROP CONSTRAINT onboarding_automations_action_type_check;
  ALTER TABLE onboarding_automations ADD CONSTRAINT onboarding_automations_action_type_check
    CHECK (action_type IN ('activate_task','complete_task','activate_stage','complete_stage','send_email','update_project_status','notify_crm'));
  ```

### 2. Delayed automations NEVER execute
- **File:** `src/lib/automation-engine.ts:70-75`
- **Impact:** Any automation with `delay_minutes > 0` is logged as "skipped" with a comment "handled by cron", but **no cron job for delayed automations exists anywhere in the codebase**. The only cron route (`/api/cron/reminders`) handles due-date reminders, not delayed automations.
- **Fix:** Either implement a `/api/cron/automations` endpoint that processes delayed automations, or remove the delay_minutes feature from the UI to avoid false configuration.

### 3. Automation emails always use staff template regardless of recipient
- **File:** `src/lib/automation-engine.ts:348-389`
- **Impact:** The `sendAutomationEmail` function reads `template_type` and `recipient_type` from config but **always calls `sendStaffNotification()`** regardless. Client-facing automated emails will have the wrong template, tone, and layout.
- **Fix:** Dispatch to the correct email function based on `templateType` (e.g., `sendClientInvite` for clients, `sendTaskReminder` for task events).

### 4. Missing migrations 004 and 005
- **Files:** Gap between `003_launchbay_template_seed.sql` and `006_comments.sql`
- **Impact:** If these migrations existed at some point and were applied to production, **the schema may have columns/tables that don't exist in the migration files**. If they never existed, the numbering gap is confusing but harmless.
- **Action needed:** Verify against the production database whether migrations 004 and 005 were ever applied.

### 5. CRM project creation doesn't copy stages or stage_ids for tasks
- **File:** `src/app/api/crm/projects/route.ts:62-87`
- **Impact:** When the CRM creates a project from a template, it copies template tasks but **does NOT copy template stages** and **does NOT assign `stage_id`** to the copied tasks. This means CRM-created projects will have **no stage groupings** — the entire stage-based workflow and stage-completion automations won't function.
- **Fix:** After copying tasks, also copy template stages (converting `template_id` to `project_id`) and map the task `stage_id` values to the new project stage IDs.

### 6. Comments table RLS policy is permissive to ALL roles
- **File:** `supabase/migrations/006_comments.sql:22-25`
- **Impact:** The `service_role_full_access` policy on `onboarding_comments` uses `USING (true) WITH CHECK (true)` without scoping to `service_role`. This means the `anon` role also gets full read/write access to all comments, unlike every other table which scopes to `service_role`.
- **Fix:** Change to `FOR ALL TO service_role USING (true) WITH CHECK (true)`.

### 7. Double-prefixed storage path in file upload
- **File:** `src/app/api/projects/[id]/files/route.ts:77-81`
- **Impact:** `storagePath` is set to `onboarding-files/${projectId}/...` and then uploaded to the `onboarding-files` bucket, so the actual storage path becomes `onboarding-files/onboarding-files/${projectId}/...`. The bucket name is duplicated in the path. This means staff-uploaded files are stored at a double-nested path that won't match the download logic.
- **Fix:** Remove the `onboarding-files/` prefix from the `storagePath` variable.

### 8. Over-permissive PATCH endpoints forward entire request body to database
- **Files:** `src/app/api/projects/[id]/route.ts`, `src/app/api/projects/[id]/tasks/[taskId]/route.ts`, `src/app/api/projects/[id]/stages/[stageId]/route.ts`
- **Impact:** These PATCH routes forward the entire JSON body to Supabase without field whitelisting. A caller with the API key can set `id`, `created_at`, `public_token`, or any other column. This is a **security vulnerability** — even though the API key is required, it still violates the principle of least privilege.
- **Fix:** Whitelist allowed fields in each PATCH route (like `/api/templates/[id]/automations/[autoId]/route.ts` correctly does).

---

## SIGNIFICANT ISSUES

### 9. `.env.example` missing 4 required env vars
- **File:** `.env.example`
- **Missing:** `RESEND_API_KEY`, `FROM_EMAIL`, `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET`, `CRON_SECRET`
- **Impact:** New developers cannot configure the app without reading source code.

### 10. Cron reminders auth allows empty secrets to pass
- **File:** `src/app/api/cron/reminders/route.ts:29-35`
- **Impact:** If `CRON_SECRET` is not set (empty string), the condition `cronSecret && CRON_SECRET && cronSecret !== CRON_SECRET` will be false (because `CRON_SECRET` is falsy), so **any value** in the `x-cron-secret` header passes auth. Same issue with `ADMIN_API_KEY`.
- **Fix:** Check that the env vars are actually set before allowing their use:
  ```typescript
  if (cronSecret && (!CRON_SECRET || cronSecret !== CRON_SECRET)) {
    return NextResponse.json({ error: 'Invalid cron secret' }, { status: 401 });
  }
  ```

### 11. XSS/HTML injection in email templates
- **File:** `src/lib/email.ts` (all template functions)
- **Impact:** User-supplied values (`clientName`, `projectName`, `taskTitle`, etc.) are interpolated directly into HTML strings without escaping. An attacker who controls a project name could inject HTML into emails sent to other users.
- **Fix:** HTML-escape all user-supplied values before interpolation.

### 12. Race condition in stage auto-completion
- **File:** `src/lib/stage-utils.ts`
- **Impact:** If two tasks in the same stage are completed simultaneously (parallel API calls), both could pass the "all tasks done" check and both attempt to mark the stage as completed and activate the next stage.
- **Fix:** Use a database-level lock or upsert with a WHERE clause to prevent double-activation.

### 13. CRM webhook has no retry mechanism
- **File:** `src/lib/crm-webhook.ts`
- **Impact:** Failed webhooks are silently dropped. If the CRM is temporarily unavailable, events are permanently lost with no dead-letter queue or retry.
- **Recommendation:** Add a retry queue table or use a background job system.

### 14. `notifyCrmAction` leaks full internal context to CRM
- **File:** `src/lib/automation-engine.ts:465-472`
- **Impact:** `...context` spreads ALL tasks and stages (including staff_notes, internal tasks) into the webhook payload. This could leak sensitive internal data to the CRM endpoint.
- **Fix:** Selectively pick only the fields the CRM needs.

### 15. Dead import in api-client.ts
- **File:** `src/lib/api-client.ts:8`
- **Impact:** `supabaseRest` is imported but never used. Not a runtime issue but indicates incomplete refactoring.

### 16. Admin API key stored in sessionStorage
- **File:** `src/lib/hooks.ts:13`
- **Impact:** The admin API key is accessible to any JavaScript running on the page. Any XSS vulnerability would expose the key.
- **Recommendation:** Use httpOnly cookies instead.

### 17. Sign Out link is broken
- **File:** `src/app/(dashboard)/layout.tsx`
- **Impact:** Sign Out navigates to `/api/auth/signout` (NextAuth), but auth is actually sessionStorage-based API key. Clicking Sign Out will not clear the API key from sessionStorage. Auth flow is inconsistent between NextAuth (configured but largely unused) and API key auth (actually used).

### 18. Portal allows clients to complete internal/staff tasks
- **File:** `src/app/p/[token]/page.tsx`
- **Impact:** The `completeTask` function PATCHes any task to `completed` without validating that the task is `external` / `client`-assignable. A client could mark internal staff tasks as completed through the portal.
- **Fix:** Add server-side validation in the portal task PATCH route to only allow completing `external` tasks.

### 19. Kanban board missing `cancelled` column
- **File:** `src/app/(dashboard)/projects/page.tsx`
- **Impact:** The board view defines columns for `draft`, `active`, `paused`, `completed` but NOT `cancelled`. Projects with cancelled status disappear entirely from the board view.

### 20. Document download opens in new tab without auth
- **File:** `src/app/(dashboard)/documents/page.tsx`
- **Impact:** `handleDownload` opens `/api/documents/${doc.id}/download` in a new tab. The new tab has no `sessionStorage` context, so the API key header won't be sent, causing a 401 error.

### 21. No automated signature requests when creating from template
- **Impact:** Even though template tasks can have `requires_signature: true`, creating a project from a template does NOT automatically create signature records in `onboarding_signatures`. Staff must manually create each signature request.

### 22. `document_hash` field never populated (ESIGN compliance gap)
- **File:** `src/app/api/portal/[token]/signatures/[sigId]/sign/route.ts`
- **Impact:** The `document_hash` column exists in the signatures table for ESIGN compliance (SHA-256 of the document at signing time), but no code ever computes or stores it.

---

### 23. Template stage/task routes don't scope by template_id
- **Files:** `src/app/api/templates/[id]/stages/[stageId]/route.ts`, `src/app/api/templates/[id]/tasks/[taskId]/route.ts`, `src/app/api/templates/[id]/tasks/reorder/route.ts`
- **Impact:** PATCH/DELETE operations on template stages and tasks only filter by the stage/task ID, not by the template_id from the URL. A caller could modify stages/tasks belonging to other templates by guessing IDs.
- **Fix:** Add `template_id=eq.${id}` to all Supabase queries in these routes.

---

## MINOR ISSUES

### 24. `hooks.ts` is misnamed — contains no React hooks
- Just utility functions for auth/fetch. Should be renamed to `client-auth.ts` or similar.

### 25. `paginationParams` doesn't validate NaN
- **File:** `src/lib/api-client.ts:59`
- `parseInt('abc')` returns NaN which propagates into query strings.

### 26. `paginationParams` returns string starting with `&`
- **File:** `src/lib/api-client.ts:60`
- Assumes caller already has a `?` in the query. Could produce `?&limit=...`.

### 27. Supabase `204` response returns `[] as unknown as T`
- **File:** `src/lib/supabase.ts:72`
- Type lie — callers expecting an object will get an empty array.

### 28. Hardcoded production URL in email fallback
- **File:** `src/lib/email.ts:9`
- Falls back to a Cloud Run URL if `NEXTAUTH_URL` is not set.

### 29. Azure AD tenant ID committed in .env.example
- **File:** `.env.example:13`
- Not a secret, but reveals the organization's Azure AD tenant.

### 30. No project-level completion check in stage-utils
- **File:** `src/lib/stage-utils.ts`
- When the last stage completes, nothing checks if the overall project should be marked complete. This only works if an automation is configured for it — fragile.

### 31. `validatePortalToken` allows access to completed projects
- **File:** `src/lib/auth.ts:94`
- Only `draft` and `cancelled` are blocked. May be intentional but should be documented.

### 32. Signature data not validated for valid base64
- **File:** `src/app/api/portal/[token]/signatures/[sigId]/sign/route.ts`
- `signature_data` is checked for length but not validated as proper base64 PNG. Malformed data would cause `embedPng` to throw.

### 33. No circular automation guard
- **File:** `src/lib/automation-engine.ts`
- Automation A could complete a task that triggers Automation B, which could trigger Automation A again. No recursion prevention exists.

### 34. PDF signature position is hardcoded
- **File:** `src/app/api/portal/[token]/signatures/[sigId]/sign/route.ts:392-410`
- Signature is always placed at fixed coordinates (50, 120). Will overlap existing content on PDFs that use that space.

### 35. `file as BodyInit` type cast in supabase storage upload
- **File:** `src/lib/supabase.ts:96`
- Minor TypeScript concern — `Uint8Array | ArrayBuffer` isn't guaranteed to satisfy `BodyInit` in all TS DOM lib versions.

### 36. No auth guard on dashboard layout
- **File:** `src/app/(dashboard)/layout.tsx`
- No middleware or layout-level check verifies the user has an API key. Users can navigate to any dashboard page unauthenticated — API calls fail with 401 and error UI renders instead of redirecting to login.

### 37. Portal upload page lacks task validation
- **File:** `src/app/p/[token]/upload/[taskId]/page.tsx`
- No check that the task belongs to the project, exists, or actually requires file upload.

### 38. `Brush Script MT` font unavailable on Linux/Android
- **File:** `src/app/p/[token]/sign/[sigId]/page.tsx`
- Typed signatures use `'Brush Script MT', cursive` which doesn't exist on Linux/Android, falling back to generic cursive.

### 39. Dead code in file upload route
- **File:** `src/app/api/projects/[id]/files/route.ts:85`
- `const uploadedBy = apiKeyHeader ? 'staff' : 'staff'` — both branches return `'staff'`, making the ternary meaningless.

### 40. Project DELETE logs wrong previous_status
- **File:** `src/app/api/projects/[id]/route.ts`
- Activity log records `previous_status: updated[0].status` but `updated[0]` already has the new `cancelled` status. The previous status is lost.

### 41. Health endpoint exposes configuration details
- **File:** `src/app/api/health/route.ts`
- Public (no auth) endpoint reveals which env vars are configured (true/false). While values aren't leaked, it helps attackers understand infrastructure.

---

## CRM-TO-AGREEMENT PROCESS MAP

Here is the complete flow as implemented:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CRM (Propello AI)                            │
│                                                                     │
│  1. GET /api/crm/templates                                         │
│     → Lists active onboarding templates for deal configuration      │
│     Auth: CRM_API_KEY header                                        │
│                                                                     │
│  2. POST /api/crm/projects                                         │
│     → Creates onboarding project from a deal                        │
│     Required: name, source_deal_id                                  │
│     Optional: template_id, client_company_name, client_contact_*    │
│     ⚠ BUG: Does NOT copy stages from template (Critical #5)        │
│                                                                     │
│  3. GET /api/crm/projects?deal_id=xxx                              │
│     → Look up onboarding projects by CRM deal ID                    │
│                                                                     │
│  4. GET /api/crm/projects/[id]/summary                             │
│     → Rich project summary (progress, signatures, next action)      │
│     Returns: portal_url, task counts, signature status              │
│                                                                     │
│  5. GET /api/crm/projects/[id]/activity                            │
│     → Activity timeline for CRM display                             │
│                                                                     │
│  All CRM endpoints use CRM_API_KEY (separate from ADMIN_API_KEY)   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Onboarding Portal (Staff)                        │
│                                                                     │
│  Dashboard: /dashboard → Overview stats, active projects            │
│  Projects:  /projects → List, create, manage                        │
│  Project:   /projects/[id] → Tasks, stages, files, signatures      │
│  Templates: /templates → Create/edit onboarding templates           │
│  Templates: /templates/[id]/automations → Configure triggers        │
│  Documents: /documents → Upload PDF templates for signing           │
│  Clients:   /clients → Client contact list                          │
│                                                                     │
│  Key Actions:                                                       │
│  • POST /api/projects/[id]/invite → Send portal link to client     │
│  • POST /api/projects/[id]/signatures → Request e-signature        │
│  • POST /api/projects/[id]/files → Upload files                    │
│  • PATCH /api/projects/[id]/tasks/[taskId] → Update task status    │
│                                                                     │
│  Auth: ADMIN_API_KEY or NextAuth session (Azure AD @psprop.net)    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Client Portal (/p/[token])                       │
│                                                                     │
│  Auth: Public token (32-char hex) in URL — no login required        │
│                                                                     │
│  Views:                                                             │
│  • /p/[token] → Project overview, tasks, progress, signatures      │
│  • /p/[token]/sign/[sigId] → E-sign a document (draw or type)     │
│  • /p/[token]/upload/[taskId] → Upload required files              │
│                                                                     │
│  Key Actions:                                                       │
│  • POST portal/[token]/signatures/[sigId]/sign → Submit signature  │
│    ✓ ESIGN Act consent capture                                      │
│    ✓ IP address + user agent logging                                │
│    ✓ Signature audit trail                                          │
│    ✓ Signed PDF generation (pdf-lib)                                │
│    ✓ Auto-completes linked task                                     │
│    ✓ Triggers automations                                           │
│    ✓ Notifies CRM via webhook                                       │
│  • POST portal/[token]/files → Upload files                        │
│  • PATCH portal/[token]/tasks/[taskId] → Update task (checklist)   │
│  • POST portal/[token]/tasks/[taskId]/comments → Add comment       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Automation Engine                                 │
│                                                                     │
│  Triggers: task_completed, stage_completed, project_created,        │
│            file_uploaded, signature_signed                           │
│                                                                     │
│  Actions:  activate_task, complete_task, activate_stage,            │
│            complete_stage, send_email, update_project_status,       │
│            notify_crm ⚠ (fails due to DB constraint)               │
│                                                                     │
│  Flow:                                                              │
│  Event → evaluateAutomations() → match trigger_config →             │
│  executeAction() → log result to onboarding_automation_log          │
│                                                                     │
│  ⚠ Delayed automations (delay_minutes > 0) are NEVER executed      │
│  ⚠ Email actions always use staff template                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CRM Webhook (Outbound)                           │
│                                                                     │
│  POST {CRM_WEBHOOK_URL} with JSON payload + HMAC-SHA256 signature  │
│                                                                     │
│  Events sent:                                                       │
│  • project_created (from CRM API route)                             │
│  • signature_signed (from portal sign route)                        │
│  • project_completed, stage_completed, task_completed               │
│    (from automation engine)                                         │
│                                                                     │
│  ⚠ Fire-and-forget, no retry on failure                            │
│  ⚠ Skips projects without source_deal_id                           │
│  ⚠ 5-second timeout                                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## DATABASE SCHEMA COMPLETENESS

### Tables (14 total)
| Table | Migration | Status |
|-------|-----------|--------|
| `onboarding_templates` | 001 | Complete |
| `onboarding_template_tasks` | 001 + 002 | Complete |
| `onboarding_projects` | 001 + 002 | Complete |
| `onboarding_tasks` | 001 + 002 | Complete |
| `onboarding_files` | 001 | Complete |
| `onboarding_documents` | 001 | Complete |
| `onboarding_signatures` | 001 + 007 | Complete |
| `onboarding_signature_audit` | 001 | Complete |
| `onboarding_activity_log` | 001 | Complete |
| `onboarding_stages` | 002 | Complete |
| `onboarding_tags` | 002 | Complete |
| `onboarding_project_tags` | 002 | Complete |
| `onboarding_automations` | 002 | **Missing `notify_crm` action type** |
| `onboarding_automation_log` | 002 | Complete |
| `onboarding_email_log` | 002 | Complete |
| `onboarding_comments` | 006 | Complete |

### Missing Migrations
- **004** and **005** are missing from the file system. Verify if they exist in production.

---

## WHAT WORKS WELL

1. **TypeScript is clean** — zero compilation errors across the entire codebase
2. **Electronic signature flow** is thorough — ESIGN Act compliance, PDF generation, audit trail, IP/UA capture
3. **CRM API surface** is well-designed with proper auth separation (CRM_API_KEY vs ADMIN_API_KEY)
4. **Database schema** is well-normalized with proper indexes, RLS, and constraints
5. **Template system** with 62-task real-world LaunchBay template is production-ready
6. **Activity logging** is comprehensive throughout the codebase
7. **Portal token auth** is properly implemented (32-byte random hex)
8. **File upload system** with Supabase Storage is functional
9. **Stage/task auto-progression** logic (stage-utils.ts) works for non-concurrent scenarios
10. **HMAC-signed CRM webhooks** provide security for outbound notifications

---

## RECOMMENDED PRIORITY FIXES

1. **[Critical]** Add `notify_crm` to database CHECK constraint (new migration)
2. **[Critical]** Fix CRM project creation to copy stages and map stage_ids
3. **[Critical]** Fix `sendAutomationEmail` to dispatch to correct email template
4. **[Critical]** Fix comments table RLS policy (scoped to `service_role`, not open to all)
5. **[Critical]** Fix double-prefixed storage path in staff file upload
6. **[Critical]** Add field whitelisting to over-permissive PATCH endpoints
7. **[High]** Add missing env vars to `.env.example`
8. **[High]** Fix cron auth bypass when env vars are empty
9. **[High]** HTML-escape user input in email templates
10. **[High]** Fix Sign Out to clear sessionStorage instead of hitting NextAuth route
11. **[High]** Add server-side validation to prevent clients completing internal tasks via portal
12. **[High]** Compute and store `document_hash` for ESIGN compliance
13. **[High]** Scope template stage/task routes by template_id
14. **[Medium]** Implement delayed automation cron or remove the feature
15. **[Medium]** Add retry mechanism to CRM webhook
16. **[Medium]** Sanitize context data before sending to CRM
17. **[Medium]** Add `cancelled` column to Kanban board view
18. **[Medium]** Fix document download to work in new tab (cookie auth or query param token)
19. **[Low]** Fix pagination NaN handling, dead imports, dead code, naming conventions
20. **[Low]** Add auth guard/redirect on dashboard layout
21. **[Low]** Validate portal upload task ownership
22. **[Low]** Fix project DELETE activity log to capture previous status
