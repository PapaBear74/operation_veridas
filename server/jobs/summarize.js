import pool from "../db/pool.js";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Compresses arguments for a given date and topic.
 * - dateStr: YYYY-MM-DD (default: today)
 * - topicId: optional, if provided only this topic is summarized
 */
export async function runDailySummarization(dateStr = null, topicId = null) {
  if (!openai) {
    console.warn("OPENAI_API_KEY not set – skipping summarization");
    return;
  }

  const date = dateStr
    ? new Date(dateStr + "T12:00:00Z")
    : new Date();
  const dateOnly = date.toISOString().slice(0, 10);
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    let topics;
    if (topicId) {
      const { rows } = await client.query(
        `SELECT id, title FROM topics WHERE id = $1`,
        [topicId]
      );
      topics = rows;
    } else {
      const { rows } = await client.query(
        `SELECT id, title FROM topics ORDER BY created_at ASC`
      );
      topics = rows;
    }

    for (const topic of topics) {
      const { rows: args } = await client.query(
        `SELECT side, text FROM arguments 
         WHERE topic_id = $1 AND created_at >= $2::date AND created_at < $3::date 
         ORDER BY created_at ASC`,
        [topic.id, dateOnly, nextDayStr]
      );

      if (args.length === 0) continue;

      const proArgs = args.filter((a) => a.side === "pro").map((a) => a.text);
      const contraArgs = args.filter((a) => a.side === "contra").map((a) => a.text);

      const maxPro = Math.min(5, Math.max(proArgs.length, 1));
      const maxContra = Math.min(5, Math.max(contraArgs.length, 1));

      const prompt = `Du bekommst Pro- und Contra-Argumente zu einem Thema.

Thema: "${topic.title}"

Pro-Argumente (vom Board):
${proArgs.length ? proArgs.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(keine)"}

Contra-Argumente (vom Board):
${contraArgs.length ? contraArgs.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(keine)"}

Deine Aufgabe:
1. KOMPRIMIERE die vorhandenen Argumente. Verwende NUR Informationen aus den obigen Texten.
   Erfinde KEINE neuen Inhalte, Beispiele, Fakten oder Szenarien.
2. Wenn ein einzelnes Argument mehrere verschiedene Punkte enthält, TEILE es in separate Argumente auf.
3. Fasse sehr ähnliche oder doppelte Argumente zu einem zusammen.
4. Entferne Beleidigungen, persönliche Daten, Off-Topic-Kommentare und irrelevante Teile.
5. Maximal ${maxPro} Pro-Punkte und maximal ${maxContra} Contra-Punkte.
6. Jeder Punkt soll wie ein einzelnes, kurzes Argument klingen (max. 1–2 Sätze).

Gib NUR gültiges JSON zurück, ohne Erklärungstext:

{
  "pro": ["Argument 1", "Argument 2"],
  "contra": ["Argument 1"]
}`;

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 600,
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? "";
        let parsed;

        try {
          parsed = JSON.parse(raw);
        } catch {
          console.error("Failed to parse AI summary JSON for topic", topic.id, raw);
          continue;
        }

        const safePro = Array.isArray(parsed.pro)
          ? parsed.pro.slice(0, maxPro).map((t) => String(t).trim()).filter(Boolean)
          : [];
        const safeContra = Array.isArray(parsed.contra)
          ? parsed.contra.slice(0, maxContra).map((t) => String(t).trim()).filter(Boolean)
          : [];

        if (!safePro.length && !safeContra.length) {
          continue;
        }

        const summaryPayload = JSON.stringify({
          pro: safePro,
          contra: safeContra,
        });

        await client.query(
          `INSERT INTO daily_summaries (topic_id, summary_date, summary_text)
           VALUES ($1, $2, $3)
           ON CONFLICT (topic_id, summary_date) DO UPDATE SET summary_text = $3`,
          [topic.id, dateOnly, summaryPayload]
        );

        console.log(`Compressed arguments for topic "${topic.title}" on ${dateOnly}`);
      } catch (aiErr) {
        console.error(`AI summarization failed for topic ${topic.id}:`, aiErr.message);
      }
    }
  } finally {
    client.release();
  }
}