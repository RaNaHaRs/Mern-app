-- 010_create_chat_tables.sql
-- Drop old tables if they have bad FK constraints and recreate cleanly

DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_conversations CASCADE;

CREATE TABLE chat_conversations (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) UNIQUE NOT NULL,
    participant_user_ids INTEGER[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    sender_id       INTEGER NOT NULL,
    content         TEXT,
    type            VARCHAR(20) NOT NULL DEFAULT 'text',
    attachment_path TEXT,
    mime_type       VARCHAR(200),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at    TIMESTAMP WITH TIME ZONE,
    seen_at         TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_name ON chat_conversations(name);

-- Seed the default rooms
INSERT INTO chat_conversations (name, participant_user_ids) VALUES
  ('general',   '{}'),
  ('engineers', '{}'),
  ('billing',   '{}'),
  ('cases',     '{}')
ON CONFLICT (name) DO NOTHING;
