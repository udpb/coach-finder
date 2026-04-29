import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import coachesHandler from "../api/coaches.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // Phase C1: /api/coaches → Supabase coaches_directory.
  // Handled in-process here (and by api/coaches.ts on Vercel in prod).
  // Must be registered BEFORE the catch-all proxy below, otherwise it
  // would be forwarded to the Python FAISS service.
  app.get("/api/coaches", async (req, res) => {
    try {
      await coachesHandler(req as any, res as any);
    } catch (err) {
      console.error("/api/coaches handler error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  });

  // Proxy remaining /api requests to the Python FastAPI backend
  app.use("/api", async (req, res) => {
    try {
      const targetUrl = `http://127.0.0.1:8000/api${req.url}`;

      const options: RequestInit = {
        method: req.method,
        headers: {
          "Content-Type": req.headers["content-type"] || "application/json",
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
        },
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && Object.keys(req.body || {}).length > 0) {
        options.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, options);
      const data = await response.json().catch(() => ({}));

      res.status(response.status).json(data);
    } catch (error) {
      console.error("Proxy error to FastAPI:", error);
      res.status(502).json({ error: "Failed to communicate with AI Backend." });
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
