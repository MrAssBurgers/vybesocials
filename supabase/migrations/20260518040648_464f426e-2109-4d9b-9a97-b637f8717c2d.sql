CREATE TABLE IF NOT EXISTS pgmq.q_auth_emails (
  msg_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL DEFAULT now(),
  message JSONB,
  headers JSONB
);

CREATE TABLE IF NOT EXISTS pgmq.a_auth_emails (
  msg_id BIGINT PRIMARY KEY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL,
  message JSONB,
  headers JSONB
);

CREATE TABLE IF NOT EXISTS pgmq.q_transactional_emails (
  msg_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL DEFAULT now(),
  message JSONB,
  headers JSONB
);

CREATE TABLE IF NOT EXISTS pgmq.a_transactional_emails (
  msg_id BIGINT PRIMARY KEY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL,
  message JSONB,
  headers JSONB
);

CREATE TABLE IF NOT EXISTS pgmq.q_auth_emails_dlq (
  msg_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL DEFAULT now(),
  message JSONB,
  headers JSONB
);

CREATE TABLE IF NOT EXISTS pgmq.a_auth_emails_dlq (
  msg_id BIGINT PRIMARY KEY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL,
  message JSONB,
  headers JSONB
);

CREATE TABLE IF NOT EXISTS pgmq.q_transactional_emails_dlq (
  msg_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL DEFAULT now(),
  message JSONB,
  headers JSONB
);

CREATE TABLE IF NOT EXISTS pgmq.a_transactional_emails_dlq (
  msg_id BIGINT PRIMARY KEY,
  read_ct INT DEFAULT 0 NOT NULL,
  enqueued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  vt TIMESTAMPTZ NOT NULL,
  message JSONB,
  headers JSONB
);

CREATE INDEX IF NOT EXISTS q_auth_emails_vt_idx ON pgmq.q_auth_emails (vt ASC);
CREATE INDEX IF NOT EXISTS archived_at_idx_auth_emails ON pgmq.a_auth_emails (archived_at);
CREATE INDEX IF NOT EXISTS q_transactional_emails_vt_idx ON pgmq.q_transactional_emails (vt ASC);
CREATE INDEX IF NOT EXISTS archived_at_idx_transactional_emails ON pgmq.a_transactional_emails (archived_at);
CREATE INDEX IF NOT EXISTS q_auth_emails_dlq_vt_idx ON pgmq.q_auth_emails_dlq (vt ASC);
CREATE INDEX IF NOT EXISTS archived_at_idx_auth_emails_dlq ON pgmq.a_auth_emails_dlq (archived_at);
CREATE INDEX IF NOT EXISTS q_transactional_emails_dlq_vt_idx ON pgmq.q_transactional_emails_dlq (vt ASC);
CREATE INDEX IF NOT EXISTS archived_at_idx_transactional_emails_dlq ON pgmq.a_transactional_emails_dlq (archived_at);

INSERT INTO pgmq.meta (queue_name, is_partitioned, is_unlogged)
VALUES
  ('auth_emails', false, false),
  ('transactional_emails', false, false),
  ('auth_emails_dlq', false, false),
  ('transactional_emails_dlq', false, false)
ON CONFLICT DO NOTHING;