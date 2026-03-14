# Debate Board

Create topics and post **Pro** / **Contra** arguments. Arguments are summarized by AI into maximum 5 arguments each for pro and contra arguments.

## Password access

- Users must enter a password when opening the page.
- Topics are grouped by password, and one password can be used for multiple topics.
- Admin can view all topics by logging in with `ADMIN_PASSWORD`.

Set these environment variables on Railway:

- `ADMIN_PASSWORD` (master password for all topics)
- `TOPIC_PASSWORD_PEPPER` (secret used to hash topic passwords)
