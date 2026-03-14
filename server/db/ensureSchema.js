import pool from "./pool.js";

export async function ensureSchema() {
  await pool.query(`ALTER TABLE topics ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE topics ADD COLUMN IF NOT EXISTS access_hash TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_topics_access_hash ON topics(access_hash)`);
}
