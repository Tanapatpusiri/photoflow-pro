-- Central private player registry. Existing event rows and media tags remain untouched.
CREATE TABLE IF NOT EXISTS fg_player_registry (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 nickname text CHECK (length(nickname)<=100),
 age_group text NOT NULL CHECK (age_group ~ '^U[0-9]{1,2}$'),
 jersey text NOT NULL CHECK (jersey ~ '^[0-9]{1,3}$'),
 team text CHECK (length(team)<=100),
 active boolean NOT NULL DEFAULT true,
 profile_jpeg bytea CHECK (octet_length(profile_jpeg)<=307200),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fg_players ADD COLUMN IF NOT EXISTS registry_id uuid REFERENCES fg_player_registry(id) ON DELETE RESTRICT;
ALTER TABLE fg_players ADD COLUMN IF NOT EXISTS age_group text;
CREATE UNIQUE INDEX IF NOT EXISTS fg_players_event_registry_uidx ON fg_players(event_id,registry_id) WHERE registry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fg_player_registry_active_idx ON fg_player_registry(active,age_group,name);
