import { Router } from "express";
import pool from "../db/pool.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, created_at FROM topics WHERE approved = true ORDER BY created_at DESC`
    );
    res.json(rows.map((r) => ({ ...r, createdAt: r.created_at?.getTime?.() ?? r.created_at })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

router.post("/", async (req, res) => {
  const { title } = req.body;
  const trimmed = String(title ?? "").trim();
  if (!trimmed) {
    return res.status(400).json({ error: "Title is required" });
  }
  if (trimmed.length > 150) {
    return res.status(400).json({ error: "Title must be at most 150 characters" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO topics (title, approved) VALUES ($1, false) RETURNING id, title, created_at`,
      [trimmed]
    );
    const t = rows[0];
    res.status(201).json({
      id: t.id,
      title: t.title,
      createdAt: t.created_at?.getTime?.() ?? t.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create topic" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM topics WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Topic not found" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete topic" });
  }
});

export default router;
