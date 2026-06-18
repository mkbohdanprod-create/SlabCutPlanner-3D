const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";
const root = path.resolve(__dirname, "dist");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  let filePath = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!path.extname(filePath)) {
    filePath = path.join(filePath, "index.html");
  }

  fs.stat(filePath, (statError, stat) => {
    const resolvedPath =
      statError || !stat.isFile() ? path.join(root, "index.html") : filePath;

    fs.readFile(resolvedPath, (readError, data) => {
      if (readError) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type":
          mimeTypes[path.extname(resolvedPath)] || "application/octet-stream",
      });
      response.end(data);
    });
  });
});

server.listen(port, host, () => {
  console.log(`SlabCutPlanner running at http://${host}:${port}`);
});
