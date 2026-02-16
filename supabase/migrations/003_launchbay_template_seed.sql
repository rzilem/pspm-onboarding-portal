-- Migration: 003_launchbay_template_seed.sql
-- Replaces the generic 28-task template with the real LaunchBay template
-- 8 stages, ~62 tasks, matching PSPM's actual onboarding workflow
-- Created: 2026-02-16

BEGIN;

-- =====================================================
-- STEP 1: Deactivate old template (preserve for reference)
-- =====================================================
UPDATE onboarding_templates
SET is_active = false, description = '[LEGACY] ' || description
WHERE name = 'New HOA Community Onboarding' AND is_active = true;

-- =====================================================
-- STEP 2: Create real template with stages
-- =====================================================
DO $$
DECLARE
    v_template_id UUID;
    v_stage_client UUID;
    v_stage_1 UUID;
    v_stage_2 UUID;
    v_stage_3 UUID;
    v_stage_4 UUID;
    v_stage_5 UUID;
    v_stage_6 UUID;
    v_stage_final UUID;
    v_order INT := 0;
BEGIN
    -- Create the template
    INSERT INTO onboarding_templates (name, description, is_active, estimated_days, created_by)
    VALUES (
        'Community Onboarding — Full Transition',
        'Complete community onboarding checklist matching PSPM LaunchBay workflow. 8 stages from client intake through go-live. Covers agreements, Vantaca setup, banking, portal/comms, vendors/insurance, compliance/billing, data migration, financial close, and collections activation.',
        true,
        60,
        'system'
    )
    RETURNING id INTO v_template_id;

    -- -----------------------------------------------------------------------
    -- CREATE STAGES
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Client Tasks', 'Documents and signatures the board/client must complete', 0, 'active')
    RETURNING id INTO v_stage_client;

    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Stage 1 — Vantaca & Banking Setup', 'Create association in system, open bank accounts, import owner data', 1, 'pending')
    RETURNING id INTO v_stage_1;

    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Stage 2 — Portal & Communications', 'Welcome letter, portal logins, board setup, website, mailing', 2, 'pending')
    RETURNING id INTO v_stage_2;

    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Stage 3 — Insurance, Documents & Vendors', 'Insurance program, association docs, vendor/ACH data, stamps, banking', 3, 'pending')
    RETURNING id INTO v_stage_3;

    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Stage 4 — Compliance & Billing Setup', 'Calendar, violations, ARC, pool, journal entries, billing, budget', 4, 'pending')
    RETURNING id INTO v_stage_4;

    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Stage 5 — Data Entry & Catchup', 'Additional info, open violations and work orders', 5, 'pending')
    RETURNING id INTO v_stage_5;

    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Stage 6 — Financial Close & History', 'Property requests, ledger imports, final financials, fund transfers, historical docs', 6, 'pending')
    RETURNING id INTO v_stage_6;

    INSERT INTO onboarding_stages (template_id, name, description, order_index, status)
    VALUES (v_template_id, 'Final Stage — Go Live', 'Turn on collection letters and finalize', 7, 'pending')
    RETURNING id INTO v_stage_final;

    -- -----------------------------------------------------------------------
    -- CLIENT TASKS (Portal-visible, client-assignee)
    -- -----------------------------------------------------------------------
    v_order := 1;

    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, requires_signature, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Sign Contract', 'Review and sign the management agreement between the association and PS Property Management.', v_order, 'external', 'client', 'signatures', true, v_stage_client, NULL);
    v_order := v_order + 1;

    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, requires_file_upload, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Upload any community documents and Information', 'Upload governing documents (CC&Rs, Bylaws, Articles), budgets, financial statements, board contacts, vendor list, reserve study, and any other relevant association documents.', v_order, 'external', 'client', 'documents', true, v_stage_client, 5);
    v_order := v_order + 1;

    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Approve Welcome Letter', 'Review and approve the welcome/introduction letter that will be sent to all homeowners announcing PS Property Management.', v_order, 'external', 'client', 'review', v_stage_client, 5);
    v_order := v_order + 1;

    -- -----------------------------------------------------------------------
    -- STAGE 1 — Vantaca & Banking Setup (5 days, internal)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Gather Information from Prior Management', 'Contact prior management company to request all association records, financial data, homeowner information, and open items.', v_order, 'internal', 'staff', 'documents', v_stage_1, 5),
        (v_template_id, 'Create New Association', 'Set up the new community/association record in Vantaca including community details, assessment structure, and chart of accounts.', v_order+1, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Let Bank know — open new accounts, if applicable', 'Contact the bank to open operating and reserve accounts for the association. Set up online banking access and authorized signers.', v_order+2, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Order Debit Card', 'Order a debit card for the association operating account for staff use on community expenses.', v_order+3, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Enter Bank Accounts', 'Enter all bank account information (operating, reserve, special) into Vantaca.', v_order+4, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Setup Funds', 'Configure fund accounting in Vantaca (operating fund, reserve fund, special assessment fund, etc.).', v_order+5, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Mark Association LIVE in system', 'Flip the association status to LIVE in Vantaca so it appears in active reports and dashboards.', v_order+6, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Import Owner''s List', 'Import the complete homeowner roster into Vantaca including owner info, lot details, email, phone, and mailing address.', v_order+7, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Merge Owners, if applicable', 'If owners appear in the import with duplicate records, merge them in Vantaca.', v_order+8, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Enter Association Addresses (NOT OWNER ADDRESSES)', 'Enter the association mailing address, physical address, and any other official addresses. This is NOT homeowner addresses.', v_order+9, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Enter start date in Association Additional Info', 'Set the management start date in Vantaca''s Association Additional Info section.', v_order+10, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Enter Assessment Frequency in Association Additional Info', 'Configure the assessment frequency (monthly, quarterly, annual, semi-annual) in Vantaca.', v_order+11, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Setup Assessments (including fees and action item charges)', 'Configure assessment billing, late fees, special assessments, and any recurring action item charges in Vantaca.', v_order+12, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Exclude GLs from Collections when setting up assessments', 'Mark any GL accounts that should be excluded from collections during assessment setup.', v_order+13, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Late fee Setup and Grace period', 'Configure late fee amounts, grace periods, and calculation method in Vantaca.', v_order+14, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Edit Collection Settings', 'Configure collection letter templates, thresholds, and escalation rules in Vantaca.', v_order+15, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'Logo, Banner, & Dashboard Pages', 'Upload community logo and banner to Vantaca. Configure the dashboard landing pages for the homeowner portal.', v_order+16, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Adjust Association Settings', 'Review and adjust all association-level settings in Vantaca (notifications, ACH, payment portal, etc.).', v_order+17, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Add Folder to Community Documents in SharePoint', 'Create the standard SharePoint folder structure for the community (Governing Documents, Financial, Board, Homeowners, Vendors).', v_order+18, 'internal', 'staff', 'setup', v_stage_1, 5),
        (v_template_id, 'Management Certificate Order Form', 'Prepare and file the management certificate order form with the county/state as required.', v_order+19, 'internal', 'staff', 'documents', v_stage_1, 5),
        (v_template_id, 'Bank Account Beginning Balance, Outstanding Items', 'Enter the beginning balance and any outstanding items (checks, deposits) for all bank accounts in Vantaca.', v_order+20, 'internal', 'staff', 'financial', v_stage_1, 5),
        (v_template_id, 'GL Trial Balance', 'Enter or verify the GL trial balance from the prior management company in Vantaca.', v_order+21, 'internal', 'staff', 'financial', v_stage_1, 5);
    v_order := v_order + 22;

    -- -----------------------------------------------------------------------
    -- STAGE 2 — Portal & Communications (10 days, internal)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Send Welcome/Intro Letter', 'Send the board-approved welcome letter to all homeowners announcing PS Property Management as the new management company.', v_order, 'internal', 'staff', 'communication', v_stage_2, 10),
        (v_template_id, 'Create Portal Logins', 'Create Vantaca homeowner portal login credentials for all homeowners. Send portal access instructions.', v_order+1, 'internal', 'staff', 'setup', v_stage_2, 10),
        (v_template_id, 'Enter Board Members & Committees (after logins are created)', 'Enter all board member details and committee assignments in Vantaca after portal logins are created.', v_order+2, 'internal', 'staff', 'setup', v_stage_2, 10),
        (v_template_id, 'Setup Homeowner Tags (Board Member Tags and Charge Tags)', 'Configure homeowner tags in Vantaca for board members, committees, and any charge-related categorizations.', v_order+3, 'internal', 'staff', 'setup', v_stage_2, 10),
        (v_template_id, 'Update Customer Service Team', 'Assign the community to the correct customer service team/manager in the CS system and phone AI routing.', v_order+4, 'internal', 'staff', 'setup', v_stage_2, 10),
        (v_template_id, 'Setup in Smartwebs, if applicable (based on Contract — Contact Ricky)', 'If the contract includes a community website, set up the community in SmartWebs or PSPM community websites platform. Contact Ricky Z for details.', v_order+5, 'internal', 'staff', 'setup', v_stage_2, 10),
        (v_template_id, 'Create connection in mailing system', 'Add the community to the mailing/postage system for official correspondence and collection letters.', v_order+6, 'internal', 'staff', 'setup', v_stage_2, 10),
        (v_template_id, 'Homeowner Additional Info', 'Enter any additional homeowner data fields (tenant info, vehicle info, pet info, gate codes, etc.) from prior management records.', v_order+7, 'internal', 'staff', 'setup', v_stage_2, 10);
    v_order := v_order + 8;

    -- -----------------------------------------------------------------------
    -- STAGE 3 — Insurance, Documents & Vendors (15 days, internal)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Email COI/Insurance Policy/Articles of Inc to setup for potential Insurance Program', 'Send the COI, insurance policies, and Articles of Incorporation to the insurance team to evaluate the association for the PSPM insurance program.', v_order, 'internal', 'staff', 'documents', v_stage_3, 15),
        (v_template_id, 'Upload Association Documents', 'Upload all received association documents to the SharePoint folder structure (governing docs, financials, board minutes, etc.).', v_order+1, 'internal', 'staff', 'documents', v_stage_3, 15),
        (v_template_id, 'Registered Agent', 'Verify or update the registered agent information with the Secretary of State if PSPM is serving as registered agent.', v_order+2, 'internal', 'staff', 'documents', v_stage_3, 15),
        (v_template_id, 'Enter Association Services/Contracts', 'Enter all active vendor service contracts and agreements into Vantaca (landscaping, pool, pest control, etc.).', v_order+3, 'internal', 'staff', 'setup', v_stage_3, 15),
        (v_template_id, 'Enter Vendor ACH Data', 'Enter ACH/direct deposit payment information for vendors who receive electronic payments.', v_order+4, 'internal', 'staff', 'financial', v_stage_3, 15),
        (v_template_id, 'New Vendors', 'Create any new vendor records in Vantaca that don''t exist yet from the prior management transfer.', v_order+5, 'internal', 'staff', 'setup', v_stage_3, 15),
        (v_template_id, 'Update Vendor & Insurance Billing Info in System', 'Update all vendor billing information and insurance certificate data in Vantaca.', v_order+6, 'internal', 'staff', 'setup', v_stage_3, 15),
        (v_template_id, 'Add Cost Code to Stamps.com', 'Add the community cost code to Stamps.com for postage tracking and billing.', v_order+7, 'internal', 'staff', 'setup', v_stage_3, 15),
        (v_template_id, 'Rename Bank Accounts with Bank', 'Contact the bank to rename accounts to reflect PS Property Management as the management company.', v_order+8, 'internal', 'staff', 'financial', v_stage_3, 15),
        (v_template_id, '1099 Data Import', 'Import prior year 1099 data for vendors to ensure accurate year-end tax reporting.', v_order+9, 'internal', 'staff', 'financial', v_stage_3, 15);
    v_order := v_order + 10;

    -- -----------------------------------------------------------------------
    -- STAGE 4 — Compliance & Billing Setup (20 days, internal)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Add dates to Association''s Calendar', 'Enter all important dates (board meetings, annual meeting, budget approval, insurance renewal, etc.) into the association calendar in Vantaca.', v_order, 'internal', 'staff', 'setup', v_stage_4, 20),
        (v_template_id, 'Change property tax mailing address/contact info', 'Update the property tax mailing address with the county appraisal district to PS Property Management''s address.', v_order+1, 'internal', 'staff', 'documents', v_stage_4, 20),
        (v_template_id, 'Violation Types & Descriptions', 'Configure all violation types and standard descriptions in Vantaca to match the community''s CC&Rs and rules.', v_order+2, 'internal', 'staff', 'setup', v_stage_4, 20),
        (v_template_id, 'ARC Types & Descriptions', 'Configure architectural review committee (ARC) request types and descriptions in Vantaca.', v_order+3, 'internal', 'staff', 'setup', v_stage_4, 20),
        (v_template_id, 'Verify Pool Permit', 'Verify the community pool permit is current and on file. Renew if needed.', v_order+4, 'internal', 'staff', 'documents', v_stage_4, 20),
        (v_template_id, 'Setup Recurring Journal Entries', 'Configure recurring journal entries in Vantaca for management fees, bank fees, insurance, and any other regular accounting entries.', v_order+5, 'internal', 'staff', 'financial', v_stage_4, 20),
        (v_template_id, 'Setup Recurring Transfers', 'Configure recurring transfers between operating and reserve accounts per the budget allocation.', v_order+6, 'internal', 'staff', 'financial', v_stage_4, 20),
        (v_template_id, 'Admin Billing Setup', 'Configure administrative billing (management fees, postage reimbursement, etc.) in Vantaca.', v_order+7, 'internal', 'staff', 'financial', v_stage_4, 20),
        (v_template_id, 'Enter Budget', 'Enter the approved annual budget into Vantaca with all GL line items.', v_order+8, 'internal', 'staff', 'financial', v_stage_4, 20),
        (v_template_id, 'Auto-Invoice MGMT Fees', 'Configure automatic monthly invoicing of management fees to the association.', v_order+9, 'internal', 'staff', 'financial', v_stage_4, 20);
    v_order := v_order + 10;

    -- -----------------------------------------------------------------------
    -- STAGE 5 — Data Entry & Catchup (30 days, internal)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Association Additional Info', 'Complete any remaining fields in Vantaca''s Association Additional Info that weren''t filled during Stage 1.', v_order, 'internal', 'staff', 'setup', v_stage_5, 30),
        (v_template_id, 'Enter Open Violations', 'Enter all open/pending violations from prior management into Vantaca''s violation tracking.', v_order+1, 'internal', 'staff', 'setup', v_stage_5, 30),
        (v_template_id, 'Enter Open Work Orders', 'Enter all open/pending work orders and maintenance requests from prior management into Vantaca.', v_order+2, 'internal', 'staff', 'setup', v_stage_5, 30);
    v_order := v_order + 3;

    -- -----------------------------------------------------------------------
    -- STAGE 6 — Financial Close & History (35 days, internal)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Association Property Request', 'Request any physical property (keys, gate remotes, pool supplies, common area inventory) from the prior management company.', v_order, 'internal', 'staff', 'documents', v_stage_6, 35),
        (v_template_id, 'Request Homeowner Ledgers and AR Report', 'Request detailed homeowner ledgers and accounts receivable report from prior management for balance verification.', v_order+1, 'internal', 'staff', 'financial', v_stage_6, 35),
        (v_template_id, 'Request Access to Gate System (if applicable)', 'Request admin access to the community gate system from the prior management company or gate vendor.', v_order+2, 'internal', 'staff', 'setup', v_stage_6, 35),
        (v_template_id, 'Homeowner Transaction History Import', 'Import historical homeowner transaction/ledger data from prior management into Vantaca.', v_order+3, 'internal', 'staff', 'financial', v_stage_6, 35),
        (v_template_id, 'Request Final Financials', 'Request the final financial statements and bank reconciliation from the prior management company through their last day of management.', v_order+4, 'internal', 'staff', 'financial', v_stage_6, 35),
        (v_template_id, 'Request remaining accounts be closed and funds sent over', 'Request the prior management company close all bank accounts and transfer remaining funds to PSPM-managed accounts.', v_order+5, 'internal', 'staff', 'financial', v_stage_6, 35),
        (v_template_id, 'Request zero balance statements after start date', 'Request zero-balance bank statements from the prior management company''s bank after the transition date to confirm account closure.', v_order+6, 'internal', 'staff', 'financial', v_stage_6, 35),
        (v_template_id, 'Upload Historical Association Documents', 'Upload all historical association documents received from prior management to SharePoint (past budgets, audits, tax returns, minutes, etc.).', v_order+7, 'internal', 'staff', 'documents', v_stage_6, 35),
        (v_template_id, 'Enter Bankruptcy action items', 'Enter any homeowner bankruptcy cases and related action items into Vantaca for the collections team.', v_order+8, 'internal', 'staff', 'financial', v_stage_6, 35),
        (v_template_id, 'Setup Community Attorney', 'Configure the community attorney contact information and relationship in Vantaca for legal referrals and collections.', v_order+9, 'internal', 'staff', 'setup', v_stage_6, 35),
        (v_template_id, 'Set Owner''s Collection Status', 'Review all homeowner accounts and set the appropriate collection status (current, delinquent, collections, legal) in Vantaca based on prior management data.', v_order+10, 'internal', 'staff', 'financial', v_stage_6, 35);
    v_order := v_order + 11;

    -- -----------------------------------------------------------------------
    -- FINAL STAGE — Go Live (60 days, internal)
    -- -----------------------------------------------------------------------
    INSERT INTO onboarding_template_tasks
        (template_id, title, description, order_index, visibility, assignee_type, category, stage_id, due_days_offset)
    VALUES
        (v_template_id, 'Turn on Collection Letters', 'After all data is verified and balances confirmed, activate the automated collection letter process in Vantaca.', v_order, 'internal', 'staff', 'financial', v_stage_final, 60);

END $$;

COMMIT;

-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- Template: "Community Onboarding — Full Transition" (60 days)
-- Stages: 8 (Client Tasks, Stage 1-6, Final Stage)
-- Tasks: 62 total
--   - 3 client-facing (external): Sign Contract, Upload Docs, Approve Welcome Letter
--   - 59 internal staff tasks across 7 stages
-- Due day offsets: 5, 10, 15, 20, 30, 35, 60
-- Categories: setup, financial, documents, communication, signatures, review
