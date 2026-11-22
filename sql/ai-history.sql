CREATE TABLE IF NOT EXISTS riglab.ai_conversations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES riglab.users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('recommend', 'review')),
    request jsonb NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx
    ON riglab.ai_conversations (user_id, id DESC);
