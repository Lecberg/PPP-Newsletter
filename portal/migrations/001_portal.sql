CREATE TABLE IF NOT EXISTS portal_locks (
  scope text PRIMARY KEY,
  token uuid NOT NULL,
  operation text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_approvals (
  campaign_id bigint PRIMARY KEY,
  list_id bigint NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL,
  snapshot jsonb NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('submitting', 'submitted', 'sent', 'unknown', 'rejected')),
  detail text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  sheet_synced boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS portal_operations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL,
  operation text NOT NULL,
  target text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Keep each reviewed attempt, including attempts rejected before a later approval.
CREATE TABLE IF NOT EXISTS portal_delivery_attempts (
  campaign_id bigint NOT NULL,
  approved_at timestamptz NOT NULL,
  list_id bigint NOT NULL,
  approved_by text NOT NULL,
  fingerprint text NOT NULL,
  snapshot jsonb NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('submitting', 'submitted', 'sent', 'unknown', 'rejected')),
  detail text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, approved_at)
);
