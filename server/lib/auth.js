import crypto from "crypto";

const PASSWORD_HEADER = "x-board-password";

function getPepper() {
  const pepper = process.env.TOPIC_PASSWORD_PEPPER;
  if (pepper && pepper.trim()) return pepper;
  return "dev-only-pepper";
}

export function getPasswordFromRequest(req) {
  const value = req.get(PASSWORD_HEADER);
  return String(value ?? "").trim();
}

export function hashBoardPassword(password) {
  return crypto.createHmac("sha256", getPepper()).update(password).digest("hex");
}

export function getAuthContext(req) {
  const password = getPasswordFromRequest(req);
  if (!password) {
    return { ok: false, status: 401, error: "Password is required" };
  }

  const adminPassword = String(process.env.ADMIN_PASSWORD ?? "");
  const isAdmin = adminPassword.length > 0 && password === adminPassword;

  return {
    ok: true,
    password,
    isAdmin,
    passwordHash: isAdmin ? null : hashBoardPassword(password),
  };
}

export async function userHasAnyAccessibleApprovedTopic(client, passwordHash) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM topics WHERE access_hash = $1 LIMIT 1`,
    [passwordHash]
  );
  return rowCount > 0;
}

export async function canAccessTopic(client, topicId, authCtx) {
  if (authCtx.isAdmin) return true;
  const { rowCount } = await client.query(
    `SELECT 1
       FROM topics
      WHERE id = $1
        AND access_hash = $2
      LIMIT 1`,
    [topicId, authCtx.passwordHash]
  );
  return rowCount > 0;
}
