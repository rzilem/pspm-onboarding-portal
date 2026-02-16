# PSPM Onboarding Portal - Phase 2 Implementation Summary

## Overview
Phase 2 adds comprehensive Project Task Management features with stage grouping, filtering, bulk operations, inline editing, checklist support, and signature request workflows.

## Files Created (4 new API routes)

### 1. `src/app/api/projects/[id]/tasks/reorder/route.ts`
- **PATCH** endpoint for bulk task reordering
- Updates `order_index` for multiple tasks in one request
- Payload: `{ tasks: [{id, order_index}] }`

### 2. `src/app/api/projects/[id]/tasks/bulk/route.ts`
- **POST** endpoint for bulk task operations
- Actions: `'complete'` or `'delete'`
- Payload: `{ task_ids: string[], action: string }`
- Logs activity for each bulk operation

### 3. `src/app/api/projects/[id]/stages/route.ts`
- **GET**: List stages for a project (ordered by `order_index`)
- **POST**: Create new stage with `{ name, description, order_index }`

### 4. `src/app/api/projects/[id]/stages/[stageId]/route.ts`
- **PATCH**: Update stage fields
- **DELETE**: Delete stage (nullifies `stage_id` on all tasks in the stage first)

## Files Modified (4 existing files)

### 1. `src/app/api/projects/[id]/tasks/[taskId]/route.ts`
**Enhanced PATCH handler:**
- Auto-sets `completed_at` and `completed_by` when status → 'completed'
- **NEW:** Auto-clears `completed_at` and `completed_by` when status changes from 'completed' to any other status

### 2. `src/app/api/projects/[id]/tasks/route.ts`
**Enhanced POST handler:**
- Added `stage_id` and `due_date` fields to task creation

### 3. `src/app/api/projects/route.ts`
**Major enhancement to POST handler:**
- Now copies **template stages** when creating a project from a template
- Maps old stage IDs → new project stage IDs
- Sets task `stage_id` using the mapping
- **Calculates task `due_date`** = `management_start_date` + `due_days_offset` (if both present)

### 4. `src/app/(dashboard)/projects/[id]/page.tsx`
**Complete rewrite (1289 lines, previously 426 lines):**

#### New State Management
- `stages`, `documents`, `selectedTasks`, `collapsedStages`
- Filter states: `statusFilter`, `categoryFilter`, `searchQuery`
- Dialog states for Add Task and Request Signature
- Project notes with auto-save on blur

#### New Features

**a) Add Task Dialog**
- Full task creation form with all fields:
  - Title, description, category, visibility, assignee type
  - Due date picker (Calendar/Popover component)
  - Stage assignment (select from project stages)
  - Requires file upload / signature checkboxes
- POST to `/api/projects/[id]/tasks`

**b) Stage-Grouped Task Display**
- Fetch stages from `/api/projects/[id]/stages`
- Collapsible stage headers with:
  - Stage name + status badge + task count (completed/total)
  - ChevronDown/ChevronRight icons
- Tasks grouped by `stage_id`
- "Unsorted" section for tasks with no stage

**c) Enhanced TaskRow Component**
- **Multi-select:** Checkbox on each task row
- **Click to expand:** Inline edit area with:
  - Title input, description textarea, staff notes textarea
  - Due date picker (Calendar/Popover)
  - **Checklist sub-items editor:**
    - List of ChecklistItem with checkbox + text
    - "Add item" input (Enter key to add)
    - X button to remove items
    - Toggle completed via checkbox
    - On change: PATCH task with updated `checklist` JSON
  - Save/Cancel buttons
- **Due date display:** Shows "Overdue" badge (red) if past due
- **Checklist indicator:** Shows "2/4" items complete
- **Status dropdown:** Select with all 5 statuses
- **Delete button:** Trash icon with confirmation

**d) Bulk Operations**
- When tasks selected, show action bar:
  - "X selected" count
  - "Mark Complete" button
  - "Delete" button (with confirmation)
  - "X" button to clear selection
- POST to `/api/projects/[id]/tasks/bulk`

**e) Task Filtering**
- **Search bar:** Filter by task title
- **Status filter:** All/Pending/In Progress/Waiting Client/Completed/Skipped
- **Category filter:** All/Documents/Setup/Signatures/Review/Financial/Communication

**f) Request Signature Dialog**
- Select document from `/api/documents` (active only)
- Signer name (required), email (required)
- Signer title, company (optional)
- Link to task (select from project tasks, optional)
- POST to `/api/projects/[id]/signatures`

**g) Notes Tab**
- Textarea for project notes
- Auto-save on blur (PATCH `/api/projects/[id]` with `{ notes }`)
- Display "Last saved" timestamp

#### UI Components Used
- **Calendar** + **Popover** for date pickers (due dates)
- **Dialog** for Add Task and Request Signature modals
- **Checkbox** for multi-select and checklist items
- **Badge** for status, overdue indicators
- **Icons:** Plus, Trash2, Search, X, ChevronDown/Right, CalendarIcon, CheckCircle2, Circle, Clock, AlertCircle

## Key Architecture Patterns

### 1. Date Handling
- Uses `date-fns` for formatting (`format`)
- Due dates stored as `YYYY-MM-DD` strings
- Calendar component uses Date objects
- Overdue check: `new Date(task.due_date) < new Date()`

### 2. Checklist Sub-Items
- Stored as JSON array in task.checklist: `ChecklistItem[]`
- Each item: `{ id: string, text: string, completed: boolean }`
- Client-side CRUD with immediate PATCH to server
- Uses `crypto.randomUUID()` for new item IDs

### 3. Stage Grouping
- Fetch stages separately: `/api/projects/[id]/stages`
- Group tasks client-side by `stage_id`
- Collapsible state managed in `Set<string>`
- "Unsorted" section for `stage_id === null`

### 4. Bulk Operations
- Multi-select uses `Set<string>` for task IDs
- Action bar appears when `selectedTasks.size > 0`
- Single API call handles all selected tasks
- Activity log entry per task (bulk_operation: true)

### 5. Template Stage Copying (API)
- On project creation with `template_id`:
  1. Copy template stages → project stages
  2. Build `stageIdMap: Record<string, string>` (old → new)
  3. Copy template tasks → project tasks
  4. Map `task.stage_id` using `stageIdMap`
  5. Calculate `task.due_date` from `management_start_date` + `due_days_offset`

## API Patterns (Next.js 16)

All new routes use this pattern:
```typescript
export async function METHOD(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId?: string; stageId?: string }> }
) {
  const authError = validateApiKey(req);
  if (authError) return authError;
  const { id, taskId, stageId } = await params;
  // ...
}
```

## UI Guidelines Applied
- PSPM cyan (#00c9e3) for primary actions
- `apiFetch` from `@/lib/hooks.ts` for client-side API calls
- `toast()` from sonner for all feedback
- Loading states with Loader2 spinner
- Calendar date picker: Button → Popover → Calendar component
- Responsive design (mobile-friendly)

## Testing Checklist
- [ ] Add task via dialog → verify appears in correct stage
- [ ] Edit task inline → verify all fields save (title, description, staff_notes, due_date)
- [ ] Add/remove/toggle checklist items → verify persists
- [ ] Filter by status/category/search → verify correct results
- [ ] Bulk select → mark complete → verify all tasks updated
- [ ] Bulk select → delete → verify confirmation + deletion
- [ ] Collapse/expand stages → verify state persists
- [ ] Due date overdue badge → verify shows for past dates
- [ ] Create project from template → verify stages + tasks copied, due dates calculated
- [ ] Request signature → verify signature created with correct links
- [ ] Project notes auto-save → verify saves on blur

## Dependencies (already installed)
- `date-fns`: ^4.1.0
- All shadcn/ui components already present

## Database Schema Assumptions
- `onboarding_stages` table exists with columns: `id`, `template_id`, `project_id`, `name`, `description`, `order_index`, `status`, timestamps
- `onboarding_template_tasks` has `stage_id` and `due_days_offset` columns
- `onboarding_tasks` has `stage_id`, `due_date`, `checklist` (JSONB), `staff_notes` columns
- `onboarding_projects` has `notes` column

## Next Steps (Not in Phase 2)
- Stage CRUD UI (add/edit/delete stages from project page)
- Drag-and-drop task reordering within stages
- Task dependencies visualization (depends_on field)
- Due date reminders (email notifications)
- File upload UI on tasks that require files
- Signature status tracking from task cards
