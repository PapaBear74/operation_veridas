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

    // #region agent log
    fetch("http://127.0.0.1:7386/ingest/9ee2d35a-b0cd-4d2c-9ab2-0c3f7ad89152", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "711679",
      },
      body: JSON.stringify({
        sessionId: "711679",
        runId: "pre-fix-1",
        hypothesisId: "H1",
        location: "server/routes/arguments.js:48",
        message: "New argument inserted, triggering summarization",
        data: {
          topicId,
          argumentId: a.id,
          side: a.side,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    // Recompute today's summary for this topic synchronously so the client
    // sees the updated summary immediately after the request completes.
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      await runDailySummarization(todayStr, topicId);
    } catch (err) {
      console.error("Failed to update daily summary after new argument:", err);

      // #region agent log
      fetch("http://127.0.0.1:7386/ingest/9ee2d35a-b0cd-4d2c-9ab2-0c3f7ad89152", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "711679",
        },
        body: JSON.stringify({
          sessionId: "711679",
          runId: "pre-fix-1",
          hypothesisId: "H4",
          location: "server/routes/arguments.js:70",
          message: "runDailySummarization threw error",
          data: {
            topicId,
            errorMessage: err.message,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log
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
