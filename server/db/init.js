import "dotenv/config";
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const schema = `
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved BOOLEAN DEFAULT false,
  access_hash TEXT
);

ALTER TABLE topics ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS access_hash TEXT;

CREATE TABLE IF NOT EXISTS arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('pro', 'contra')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  summary_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_arguments_topic_id ON arguments(topic_id);
CREATE INDEX IF NOT EXISTS idx_arguments_created_at ON arguments(created_at);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_topic_date ON daily_summaries(topic_id, summary_date);
CREATE INDEX IF NOT EXISTS idx_topics_access_hash ON topics(access_hash);
`;

async function init() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log("Database initialized successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch((err) => {
  console.error("Database init failed:", err);
  process.exit(1);
});
