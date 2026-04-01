import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simulation of Cloudflare Functions for the preview environment
  // This allows the app to work here without being deployed to Cloudflare yet.
  
  // Helper to mock Cloudflare's Request/Response for our functions
  const handleFunction = async (modulePath: string, req: express.Request, res: express.Response) => {
    try {
      const module = await import(modulePath);
      const handler = module.onRequestPost || module.onRequestGet || module.onRequest;
      
      if (!handler) {
        return res.status(404).json({ error: 'Function handler not found' });
      }

      // Mock the Cloudflare 'env' object from process.env
      const env = { ...process.env };
      
      // Mock the Cloudflare 'request' object
      const cfRequest = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as any,
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      });

      const response = await handler({ request: cfRequest, env });
      const data = await response.json();
      
      res.status(response.status).json(data);
    } catch (err: any) {
      console.error(`Error in function ${modulePath}:`, err);
      res.status(500).json({ error: err.message });
    }
  };

  // Route mappings for the preview environment
  app.post('/api/tournament/setup', (req, res) => handleFunction('./functions/api/tournament.ts', req, res));
  app.get('/api/tournament', (req, res) => handleFunction('./functions/api/tournament.ts', req, res));
  app.get('/api/tournaments', (req, res) => handleFunction('./functions/api/tournaments.ts', req, res));
  app.post('/api/tournament/load', (req, res) => handleFunction('./functions/api/tournaments.ts', req, res));
  app.post('/api/tournament/delete', (req, res) => handleFunction('./functions/api/tournaments.ts', req, res));
  app.post('/api/upload/avatar-url', (req, res) => handleFunction('./functions/api/upload/avatar-url.ts', req, res));
  app.post('/api/verify-turnstile', (req, res) => handleFunction('./functions/api/verify-turnstile.ts', req, res));
  app.post('/api/tournament/reset', (req, res) => handleFunction('./functions/api/tournament/reset.ts', req, res));
  app.post('/api/tournament/clear-all', (req, res) => handleFunction('./functions/api/tournament/clear-all.ts', req, res));

  // Vite middleware for frontend
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Development bridge running on http://localhost:${PORT}`);
  });
}

startServer();
