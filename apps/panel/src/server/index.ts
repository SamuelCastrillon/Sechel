import { createApp } from '@sechel/server';

// Create the Hono app instance once
const app = createApp();

/**
 * Handle API requests by forwarding to the embedded @sechel/server.
 * Used by Astro endpoints to delegate /api/* and /mcp to Hono.
 */
export async function handleApiRequest(request: Request): Promise<Response> {
  return app.fetch(request);
}
