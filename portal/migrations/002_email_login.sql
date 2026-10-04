CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, name varchar(255), email varchar(255), "emailVerified" timestamptz, image text
);
CREATE UNIQUE INDEX IF NOT EXISTS portal_auth_email_unique ON users (email);
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY, "userId" integer NOT NULL, type varchar(255) NOT NULL,
  provider varchar(255) NOT NULL, "providerAccountId" varchar(255) NOT NULL,
  refresh_token text, access_token text, expires_at bigint, id_token text,
  scope text, session_state text, token_type text
);
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY, "userId" integer NOT NULL, expires timestamptz NOT NULL, "sessionToken" varchar(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS verification_token (
  identifier text NOT NULL, expires timestamptz NOT NULL, token text NOT NULL,
  PRIMARY KEY (identifier, token)
);
CREATE INDEX IF NOT EXISTS portal_auth_token_expiry ON verification_token (expires);
CREATE TABLE IF NOT EXISTS portal_login_limits (
  key text PRIMARY KEY, requests timestamptz[] NOT NULL
);
