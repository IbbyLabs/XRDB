-- Add family_id and mode columns to community_themes for the theme family+mode system.
-- Both columns are nullable for backward compatibility with existing rows.

ALTER TABLE community_themes ADD COLUMN family_id TEXT;
ALTER TABLE community_themes ADD COLUMN mode      TEXT;
