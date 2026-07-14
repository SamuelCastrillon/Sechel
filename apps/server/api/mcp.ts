// apps/server/api/mcp.ts
// Vercel serverless entry point.
// Rewrites in vercel.json route all requests here.
import { createApp } from '../src/index.js';

const app = createApp();

export default async function handler(req: Request): Promise<Response> {
  return app.fetch(req);
}
