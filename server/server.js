import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
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

app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
