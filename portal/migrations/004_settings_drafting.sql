CREATE TABLE IF NOT EXISTS portal_settings_changes (
  id uuid PRIMARY KEY,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  previous_version text NOT NULL,
  before_settings jsonb NOT NULL,
  after_settings jsonb NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('submitting', 'saved', 'failed', 'unknown'))
);
CREATE TABLE IF NOT EXISTS portal_draft_requests (
  request_id uuid PRIMARY KEY,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('submitting', 'queued', 'running', 'ready', 'failed', 'unknown')),
  run_id bigint UNIQUE,
  campaign_id bigint,
  message text
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_one_active_draft ON portal_draft_requests ((true)) WHERE state IN ('submitting', 'queued', 'running', 'unknown');
