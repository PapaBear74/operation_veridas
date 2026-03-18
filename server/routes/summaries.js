import { Router } from "express";
import pool from "../db/pool.js";
import { canAccessTopic, getOptionalAuthContext } from "../lib/auth.js";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const { topicId } = req.params;
  const auth = getOptionalAuthContext(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  try {
    const allowed = await canAccessTopic(pool, topicId, auth);
    if (!allowed) return res.status(403).json({ error: "Access denied" });

    const { rows } = await pool.query(
      `SELECT id, topic_id, summary_date, summary_text, created_at FROM daily_summaries 
       WHERE topic_id = $1 ORDER BY summary_date DESC`,
      [topicId]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        topicId: r.topic_id,
        summaryDate: r.summary_date,
        summaryText: r.summary_text,
        createdAt: r.created_at?.getTime?.() ?? r.created_at,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch summaries" });
  }
});

export default router;
