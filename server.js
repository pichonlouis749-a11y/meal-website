const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

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
  if (url.pathname.startsWith("/api/")) {
    sendText(res, 404, "API locale désactivée. Les données sont gérées par Supabase.");
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
