const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://hrwckkwdipilwkjjzyzf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_wR-rYtiUnDYrPqjz9rHz5Q_qKYwXZUC";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function fetchSupabase(pathname, options = {}) {
  const { serviceRole, headers, ...fetchOptions } = options;
  const apiKey = serviceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...fetchOptions,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function signInWithPseudo(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Méthode non autorisée." });
    return;
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    sendJson(res, 503, { error: "Pseudo sign-in is not configured." });
    return;
  }

  const { identifier, password } = await readJsonBody(req);
  const pseudo = String(identifier || "").trim();

  if (!pseudo || !password || pseudo.includes("@")) {
    sendJson(res, 400, { error: "Identifiant ou mot de passe incorrect." });
    return;
  }

  const profilePath = `/rest/v1/profiles?select=id&display_name=ilike.${encodeURIComponent(pseudo)}&limit=2`;
  const { response: profileResponse, payload: profiles } = await fetchSupabase(profilePath, {
    serviceRole: true
  });

  if (!profileResponse.ok || !Array.isArray(profiles) || profiles.length !== 1) {
    sendJson(res, 401, { error: "Identifiant ou mot de passe incorrect." });
    return;
  }

  const { response: userResponse, payload: userPayload } = await fetchSupabase(
    `/auth/v1/admin/users/${profiles[0].id}`,
    { serviceRole: true }
  );

  if (!userResponse.ok || !userPayload.email) {
    sendJson(res, 401, { error: "Identifiant ou mot de passe incorrect." });
    return;
  }

  const { response: sessionResponse, payload: sessionPayload } = await fetchSupabase("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userPayload.email, password })
  });

  if (!sessionResponse.ok) {
    sendJson(res, 401, { error: "Identifiant ou mot de passe incorrect." });
    return;
  }

  sendJson(res, 200, {
    session: {
      access_token: sessionPayload.access_token,
      refresh_token: sessionPayload.refresh_token
    }
  });
}

async function sendFile(res, filePath) {
  const content = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  const isStaticAsset = ![".html", ".css", ".js"].includes(ext);

  res.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Cache-Control": isStaticAsset ? "public, max-age=3600" : "no-store"
  });
  res.end(content);
}

async function serveStatic(req, res, url) {
  if (url.pathname === "/api/auth/sign-in") {
    await signInWithPseudo(req, res);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendText(res, 404, "API introuvable.");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    await sendFile(res, filePath);
  } catch {
    await sendFile(res, path.join(PUBLIC_DIR, "index.html"));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendText(res, 500, "Une erreur serveur est survenue.");
  }
});

server.listen(PORT, () => {
  console.log(`Meal website disponible sur http://localhost:${PORT}`);
});
