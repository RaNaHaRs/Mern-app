-- Add reply_to_id column to client_communications to link replies to original messages
ALTER TABLE client_communications
ADD COLUMN reply_to_id UUID REFERENCES client_communications(id) ON DELETE SET NULL;

-- Index for faster lookups of replies to a specific message
CREATE INDEX idx_client_communications_reply_to_id ON client_communications(reply_to_id);
