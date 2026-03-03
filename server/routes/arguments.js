import { Router } from "express";
import pool from "../db/pool.js";
import { runDailySummarization } from "../jobs/summarize.js";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const { topicId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, topic_id, side, text, created_at FROM arguments 
       WHERE topic_id = $1 ORDER BY created_at DESC`,
      [topicId]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        topicId: r.topic_id,
        side: r.side,
        text: r.text,
        createdAt: r.created_at?.getTime?.() ?? r.created_at,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch arguments" });
  }
});

router.post("/", async (req, res) => {
  const { topicId } = req.params;
  const { side, text } = req.body;
  const trimmed = String(text ?? "").trim();
  const safeSide = side === "contra" ? "contra" : "pro";
  if (!trimmed) {
    return res.status(400).json({ error: "Text is required" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO arguments (topic_id, side, text) VALUES ($1, $2, $3) 
       RETURNING id, topic_id, side, text, created_at`,
      [topicId, safeSide, trimmed]
    );
    const a = rows[0];

    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      await runDailySummarization(todayStr, topicId);
    } catch (err) {
      console.error("Failed to update summary after new argument:", err);
    }

    res.status(201).json({
      id: a.id,
      topicId: a.topic_id,
      side: a.side,
      text: a.text,
      createdAt: a.created_at?.getTime?.() ?? a.created_at,
    });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(404).json({ error: "Topic not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to create argument" });
  }
});

router.delete("/:id", async (req, res) => {
  const { topicId, id } = req.params;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM arguments WHERE id = $1 AND topic_id = $2`,
      [id, topicId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Argument not found" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete argument" });
  }
});

export default router;
