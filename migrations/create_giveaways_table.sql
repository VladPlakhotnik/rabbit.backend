-- Create enum for giveaway status
CREATE TYPE giveaway_status AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- Create giveaways table
CREATE TABLE IF NOT EXISTS giveaways (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    skin_id INTEGER NOT NULL,
    participant_count INTEGER NOT NULL DEFAULT 0,
    required_deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    participants INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status giveaway_status NOT NULL DEFAULT 'UPCOMING',
    winner_user_id INTEGER NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_skin FOREIGN KEY (skin_id) REFERENCES csgo_skins(id) ON DELETE CASCADE,
    CONSTRAINT fk_winner FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT check_times CHECK (end_time > start_time),
    CONSTRAINT check_participant_count CHECK (participant_count >= 0)
);

-- Create indexes for better query performance
CREATE INDEX idx_giveaways_status ON giveaways(status);
CREATE INDEX idx_giveaways_start_time ON giveaways(start_time);
CREATE INDEX idx_giveaways_end_time ON giveaways(end_time);
CREATE INDEX idx_giveaways_winner_user_id ON giveaways(winner_user_id);
CREATE INDEX idx_giveaways_skin_id ON giveaways(skin_id);

-- Create GIN index for participants array for efficient array queries
CREATE INDEX idx_giveaways_participants ON giveaways USING GIN(participants);

