-- Preserve every legacy event identity and tag. Missing historical data is unknown, not fabricated.
ALTER TABLE fg_player_registry ALTER COLUMN age_group DROP NOT NULL;
ALTER TABLE fg_player_registry ALTER COLUMN jersey DROP NOT NULL;
INSERT INTO fg_player_registry(id,name,age_group,jersey,team)
SELECT id,name,CASE WHEN age_group ~ '^U[0-9]{1,2}$' THEN age_group END,
 CASE WHEN jersey ~ '^[0-9]{1,3}$' THEN jersey END,team
FROM fg_players WHERE registry_id IS NULL
ON CONFLICT(id) DO NOTHING;
UPDATE fg_players p SET registry_id=p.id
WHERE p.registry_id IS NULL AND EXISTS (SELECT 1 FROM fg_player_registry r WHERE r.id=p.id);
