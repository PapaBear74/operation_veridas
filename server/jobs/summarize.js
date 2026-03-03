import pool from "../db/pool.js";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Summarizes arguments from a given date for each topic.
 * - dateStr: YYYY-MM-DD (default: yesterday, for the daily cron job)
 * - topicId: optional, if provided only this topic is summarized
 */
export async function runDailySummarization(dateStr = null, topicId = null) {
  if (!openai) {
    console.warn("OPENAI_API_KEY not set – skipping summarization");
    return;
  }

  const date = dateStr
    ? new Date(dateStr + "T12:00:00Z")
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
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

      const prompt = `Fasse die folgenden Argumente zum Thema "${topic.title}" vom ${dateOnly} zusammen.

Pro-Argumente:
${proArgs.map((t) => `- ${t}`).join("\n")}

Contra-Argumente:
${contraArgs.map((t) => `- ${t}`).join("\n")}

Gruppiere ähnliche Punkte und formuliere daraus maximal 5 aussagekräftige Pro-Argumente
und maximal 5 aussagekräftige Contra-Argumente. Schreibe klar und sachlich auf Deutsch.
Nutze wenn möglich dieses Format:

Pro:
1. ...
2. ...

Contra:
1. ...
2. ...`;

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
        });
        const summaryText = completion.choices[0]?.message?.content?.trim() ?? "";

        if (summaryText) {
          await client.query(
            `INSERT INTO daily_summaries (topic_id, summary_date, summary_text)
             VALUES ($1, $2, $3)
             ON CONFLICT (topic_id, summary_date) DO UPDATE SET summary_text = $3`,
            [topic.id, dateOnly, summaryText]
          );
          console.log(`Summarized topic "${topic.title}" for ${dateOnly}`);
        }
      } catch (aiErr) {
        console.error(`AI summarization failed for topic ${topic.id}:`, aiErr.message);
      }
    }
  } finally {
    client.release();
  }
}
