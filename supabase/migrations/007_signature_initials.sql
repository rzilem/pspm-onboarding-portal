-- Add initials and initials_data columns to onboarding_signatures
-- These store the typed initials string and drawn initials base64 PNG
ALTER TABLE onboarding_signatures ADD COLUMN IF NOT EXISTS initials TEXT;
ALTER TABLE onboarding_signatures ADD COLUMN IF NOT EXISTS initials_data TEXT;
