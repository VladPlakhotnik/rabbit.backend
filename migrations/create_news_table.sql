-- Create news table
CREATE TABLE IF NOT EXISTS news (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_news_slug ON news(slug);
CREATE INDEX idx_news_created_at ON news(created_at DESC);

-- Create GIN index for JSONB content for efficient JSON queries
CREATE INDEX idx_news_content ON news USING GIN(content);
