# Debate Board

Create topics and post **Pro** / **Contra** arguments. Arguments are stored in a database and summarized daily by AI.

## Run locally

1. **PostgreSQL** – install and create a database.
2. **Node.js** – v18+.

```bash
cd server
cp .env.example .env
# Edit .env: set DATABASE_URL and OPENAI_API_KEY

npm install
npm run db:init
npm run dev
```

3. Open http://localhost:3000

## Deploy (Railway / Render)

1. Create a new project, add **PostgreSQL**.
2. Set env vars: `DATABASE_URL`, `OPENAI_API_KEY`, optionally `CRON_SECRET`.
3. Set start command: `cd server && npm install && npm run db:init && npm start`
4. For daily summarization:
   - **Railway**: Use [cron-job.org](https://cron-job.org) to call `GET https://your-app.railway.app/api/cron/summarize` daily (add header `Authorization: Bearer YOUR_CRON_SECRET`).
   - **Render**: Use a [Cron Job](https://render.com/docs/cron-jobs) service.

## Features

- Create topics, post Pro/Contra arguments
- Delete arguments and topics
- **Daily AI summaries** – arguments from each day are summarized by AI (e.g. GPT-4o-mini)
- No auth – anonymous usage
