-- 在现有 RIGLAB 数据库的 Query Tool 中执行。
BEGIN;


ALTER TABLE riglab.users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE riglab.users ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE riglab.users ADD COLUMN IF NOT EXISTS ai_memory_enabled boolean NOT NULL DEFAULT true;


CREATE TABLE IF NOT EXISTS riglab.sessions
    (token_hash text PRIMARY KEY,
                     user_id bigint NOT NULL REFERENCES riglab.users(id) ON DELETE CASCADE,
                                                                                   created_at timestamptz NOT NULL DEFAULT now(),
                                                                                                                           expires_at timestamptz NOT NULL);


CREATE INDEX IF NOT EXISTS sessions_user_idx ON riglab.sessions(user_id);


CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON riglab.sessions(expires_at);


COMMIT;
