import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

const router = Router();

/**
 * GET /docs/openapi.json
 * Serves the raw OpenAPI 3.0 spec.
 */
router.get("/openapi.json", (_req: Request, res: Response) => {
  // In ts-node-dev: __dirname = src/api/routes → spec is ../openapi.json
  // In compiled dist: __dirname = dist/api/routes → spec is ../openapi.json
  const specPath = path.join(__dirname, "..", "openapi.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
  res.json(spec);
});

/**
 * GET /docs
 * Serves Swagger UI (CDN-hosted) pointing at /docs/openapi.json.
 * Only registered in dev mode (see app.ts).
 */
router.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BOXMEOUT API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/docs/openapi.json",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      deepLinking: true,
    });
  </script>
</body>
</html>`);
});

export default router;
