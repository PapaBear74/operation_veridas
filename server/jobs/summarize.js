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
        hypothesisId: "H2",
        location: "server/jobs/summarize.js:16",
        message: "runDailySummarization called without OpenAI client",
        data: { dateStr, topicId, hasApiKey: Boolean(process.env.OPENAI_API_KEY) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log
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
        location: "server/jobs/summarize.js:30",
        message: "runDailySummarization start",
        data: { dateOnly, nextDayStr, topicId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

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
          hypothesisId: "H3",
          location: "server/jobs/summarize.js:55",
          message: "Topic args fetched for summarization",
          data: {
            topicId: topic.id,
            proCount: proArgs.length,
            contraCount: contraArgs.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log

      const maxProPoints = Math.min(5, proArgs.length);
      const maxContraPoints = Math.min(5, contraArgs.length);

      const prompt = `Fasse die folgenden Argumente zum Thema "${topic.title}" vom ${dateOnly} zusammen.

Pro-Argumente:
${proArgs.map((t) => `- ${t}`).join("\n")}

Contra-Argumente:
${contraArgs.map((t) => `- ${t}`).join("\n")}

Deine Aufgabe:
- Du hast insgesamt ${proArgs.length} Pro-Argument(e) und ${contraArgs.length} Contra-Argument(e).
- Gruppiere ähnliche Punkte und fasse sie in eigenständige, klare Argumente zusammen.
- Erzeuge höchstens ${maxProPoints} Pro-Punkte und höchstens ${maxContraPoints} Contra-Punkte.
- Erzeuge niemals mehr Pro-Punkte als es ursprüngliche Pro-Argumente gibt und niemals mehr Contra-Punkte
  als ursprüngliche Contra-Argumente. Wenn es weniger gibt, gib nur so viele Punkte aus.
- Jedes Argument soll so klingen, als hätte eine andere Person es als einzelnen Beitrag geschrieben
  (also wie ein eigener kurzer Standpunkt, keine Ich-Form, keine langen Fließtexte).
- Ignoriere Inhalte, die nichts mit dem Thema zu tun haben, beleidigend, persönlich oder unnötig sind
  (z.B. Namen, persönliche Daten, Off-Topic-Kommentare).
- Erfinde keine neuen Argumente, sondern bleibe inhaltlich möglichst nah an den eingereichten Argumenten.

Gib NUR folgenden Aufbau zurück:

Pro:
1. [erstes komprimiertes Pro-Argument, 1–2 Sätze]
2. [zweites komprimiertes Pro-Argument]
3. ...
(maximal 5 Punkte, ggf. weniger)

Contra:
1. [erstes komprimiertes Contra-Argument, 1–2 Sätze]
2. [zweites komprimiertes Contra-Argument]
3. ...
(maximal 5 Punkte, ggf. weniger)`;

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
              location: "server/jobs/summarize.js:88",
              message: "Summary stored for topic",
              data: {
                topicId: topic.id,
                dateOnly,
                hasSummaryText: Boolean(summaryText),
                summaryPreview: summaryText.slice(0, 120),
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion agent log
        }
      } catch (aiErr) {
        console.error(`AI summarization failed for topic ${topic.id}:`, aiErr.message);

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
            location: "server/jobs/summarize.js:99",
            message: "AI summarization failed",
            data: {
              topicId: topic.id,
              errorMessage: aiErr.message,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion agent log
      }
    }
  } finally {
    client.release();
  }
}
