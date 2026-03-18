import { Router } from "express";
import OpenAI from "openai";
import pool from "../db/pool.js";
import {
  getAuthContext,
  hashBoardPassword,
} from "../lib/auth.js";

const router = Router();
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function moderateTopicTitle(title) {
  if (!openai) {
    return {
      allowed: false,
      reason: "KI-Pruefung ist gerade nicht verfuegbar. Bitte spaeter erneut versuchen.",
    };
  }

  const prompt = `Pruefe, ob dieses Diskussionsthema zugelassen werden soll:
"${title}"

Lehne das Thema ab, wenn mindestens einer dieser Punkte zutrifft:
- Beleidigungen oder Beschimpfungen.
- Nennung einzelner Personen bei Vor- oder Nachnamen, AUSSER allgemein bekannte Staatsoberhaeupter oder Politiker
  (z.B. Trump, Putin, Netanjahu, Khamenei).
- Off-Topic-Inhalt oder nichts Sachliches fuer ein Diskussionsthema.
- Persoenliche Daten (Adressen, Telefonnummern etc.).

Gib NUR gueltiges JSON zurueck:
{
  "allowed": true oder false,
  "reason": "kurze Begruendung auf Deutsch fuer den Nutzer"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 250,
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse AI moderation response");
  }

  const allowed = Boolean(parsed?.allowed);
  const reason = String(parsed?.reason ?? "").trim();
  return { allowed, reason };
}

router.get("/me", (req, res) => {
  const auth = getAuthContext(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  res.json({ isAdmin: auth.isAdmin });
});

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
          WHERE access_hash = $1
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
    let moderation;
    try {
      moderation = await moderateTopicTitle(trimmed);
    } catch (moderationErr) {
      console.error("Topic moderation failed:", moderationErr);
      return res.status(503).json({
        error: "Die KI-Pruefung ist fehlgeschlagen. Bitte spaeter erneut versuchen.",
      });
    }

    if (!moderation.allowed) {
      return res.status(422).json({
        error: moderation.reason || "Topic was rejected by AI moderation",
      });
    }

    const topicPasswordHash = hashBoardPassword(topicPassword);
    const { rows } = await pool.query(
      `INSERT INTO topics (title, approved, access_hash)
       VALUES ($1, true, $2)
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

router.patch("/:id/approval", async (req, res) => {
  const auth = getAuthContext(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }
  if (!auth.isAdmin) {
    return res.status(403).json({ error: "Only admin can approve topics" });
  }

  const approved = req.body?.approved;
  if (typeof approved !== "boolean") {
    return res.status(400).json({ error: "approved must be boolean" });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE topics
          SET approved = $1
        WHERE id = $2
      RETURNING id, title, approved, created_at`,
      [approved, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Topic not found" });
    const t = rows[0];
    res.json({
      id: t.id,
      title: t.title,
      approved: t.approved,
      createdAt: t.created_at?.getTime?.() ?? t.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update topic approval" });
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
