import { Router } from "express";
import pool from "../db/pool.js";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const { topicId } = req.params;
  try {
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
