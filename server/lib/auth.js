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

export function getOptionalAuthContext(req) {
  const password = getPasswordFromRequest(req);
  if (!password) {
    return {
      ok: true,
      password: "",
      isAdmin: false,
      passwordHash: null,
    };
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

export function getAuthContext(req) {
  const optionalAuth = getOptionalAuthContext(req);
  if (!optionalAuth.password) {
    return { ok: false, status: 401, error: "Password is required" };
  }
  return optionalAuth;
}

export async function userHasAnyAccessibleApprovedTopic(client, passwordHash) {
  if (!passwordHash) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM topics WHERE access_hash IS NULL LIMIT 1`
    );
    return rowCount > 0;
  }

  const { rowCount } = await client.query(
    `SELECT 1 FROM topics WHERE access_hash = $1 OR access_hash IS NULL LIMIT 1`,
    [passwordHash]
  );
  return rowCount > 0;
}

export async function canAccessTopic(client, topicId, authCtx) {
  if (authCtx.isAdmin) return true;

  if (!authCtx.passwordHash) {
    const { rowCount } = await client.query(
      `SELECT 1
         FROM topics
        WHERE id = $1
          AND access_hash IS NULL
        LIMIT 1`,
      [topicId]
    );
    return rowCount > 0;
  }

  const { rowCount } = await client.query(
    `SELECT 1
       FROM topics
      WHERE id = $1
        AND (access_hash = $2 OR access_hash IS NULL)
      LIMIT 1`,
    [topicId, authCtx.passwordHash]
  );
  return rowCount > 0;
}
