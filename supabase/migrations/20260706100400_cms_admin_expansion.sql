-- CMS admin expansion: additive, idempotent columns.
-- Events gain an editable hero image; committee members gain contact and bio fields
-- (all already allowlisted in app/api/admin/resources/[resource]/route.ts).

ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE committee_members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE committee_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE committee_members ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE committee_members ADD COLUMN IF NOT EXISTS image_url TEXT;

NOTIFY pgrst, 'reload schema';
