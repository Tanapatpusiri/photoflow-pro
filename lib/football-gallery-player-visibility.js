export const PLAYER_CONSENT_JOIN=`CROSS JOIN LATERAL (
      SELECT COALESCE(bool_or(pr.revoked_at IS NULL AND pr.scope='private_gallery' AND pr.reviewed_at IS NOT NULL),false) AS approved,
       COALESCE(bool_or(pr.revoked_at IS NOT NULL),false) AS withdrawn
      FROM fg_privacy_records pr WHERE pr.player_id=p.id AND pr.event_id=p.event_id
     ) consent`;
export const VISIBLE_PLAYER_SQL="p.visible=true AND (NOT consent.withdrawn OR consent.approved)";
