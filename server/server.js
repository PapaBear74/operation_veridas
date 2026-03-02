import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import topicsRouter from "./routes/topics.js";
import argumentsRouter from "./routes/arguments.js";
import summariesRouter from "./routes/summaries.js";
import { runDailySummarization } from "./jobs/summarize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, "..");
app.use(express.static(publicPath));

app.use("/api/topics", topicsRouter);
app.use("/api/topics/:topicId/arguments", argumentsRouter);
app.use("/api/topics/:topicId/summaries", summariesRouter);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/cron/summarize", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    await runDailySummarization();
    res.json({ ok: true, message: "Summarization completed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

cron.schedule("0 0 * * *", async () => {
  console.log("Running daily summarization...");
  try {
    await runDailySummarization();
  } catch (err) {
    console.error("Daily summarization failed:", err);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
