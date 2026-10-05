CREATE TABLE IF NOT EXISTS portal_recipient_selections (
  campaign_id bigint NOT NULL,
  list_id bigint NOT NULL,
  excluded_ids bigint[] NOT NULL DEFAULT '{}',
  revision bigint NOT NULL DEFAULT 0,
  exclusion_list_id bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, list_id)
);
