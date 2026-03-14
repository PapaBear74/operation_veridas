import { Router } from "express";
import pool from "../db/pool.js";
import {
  getAuthContext,
  hashBoardPassword,
  userHasAnyAccessibleApprovedTopic,
} from "../lib/auth.js";

const router = Router();

router.get("/", async (req, res) => {
  const auth = getAuthContext(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const query = auth.isAdmin
      ? `SELECT id, title, approved, created_at
           FROM topics
          ORDER BY created_at DESC`
      : `SELECT id, title, approved, created_at
           FROM topics
          WHERE approved = true AND access_hash = $1
          ORDER BY created_at DESC`;
    const params = auth.isAdmin ? [] : [auth.passwordHash];
    const { rows } = await pool.query(query, params);
    res.json(rows.map((r) => ({ ...r, createdAt: r.created_at?.getTime?.() ?? r.created_at })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

router.post("/", async (req, res) => {
  const auth = getAuthContext(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { title, password } = req.body;
  const trimmed = String(title ?? "").trim();
  const topicPassword = String(password ?? "").trim();
  if (!trimmed) {
    return res.status(400).json({ error: "Title is required" });
  }
  if (trimmed.length > 150) {
    return res.status(400).json({ error: "Title must be at most 150 characters" });
  }
  if (!topicPassword) {
    return res.status(400).json({ error: "Password is required" });
  }

  const adminPassword = String(process.env.ADMIN_PASSWORD ?? "");
  if (adminPassword.length > 0 && topicPassword === adminPassword) {
    return res.status(400).json({ error: "Please choose a non-admin topic password" });
  }

  try {
    if (!auth.isAdmin) {
      const canCreate = await userHasAnyAccessibleApprovedTopic(pool, auth.passwordHash);
      if (!canCreate) {
        return res.status(403).json({
          error: "You can request topics only after logging in with a password that already has topics",
        });
      }
    }

    const topicPasswordHash = hashBoardPassword(topicPassword);
    const { rows } = await pool.query(
      `INSERT INTO topics (title, approved, access_hash)
       VALUES ($1, false, $2)
       RETURNING id, title, approved, created_at`,
      [trimmed, topicPasswordHash]
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
  const auth = getAuthContext(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  if (!auth.isAdmin) {
    return res.status(403).json({ error: "Only admin can delete topics" });
  }

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
