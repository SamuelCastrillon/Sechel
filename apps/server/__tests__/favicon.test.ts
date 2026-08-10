import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('API favicon', () => {
  const app = createApp();

  it('serves /favicon.ico as an image/png with cache headers', async () => {
    const res = await app.request('/favicon.ico');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.subarray(0, 8)]).toEqual(PNG_MAGIC);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('serves the /icon.png alias with the same bytes', async () => {
    const [favicon, icon] = await Promise.all([
      app.request('/favicon.ico'),
      app.request('/icon.png'),
    ]);
    expect(favicon.status).toBe(200);
    expect(icon.status).toBe(200);
    expect(icon.headers.get('Content-Type')).toBe('image/png');
    const faviconBytes = new Uint8Array(await favicon.arrayBuffer());
    const iconBytes = new Uint8Array(await icon.arrayBuffer());
    expect(iconBytes).toEqual(faviconBytes);
  });

  it('does not capture admin routes (exact paths only)', async () => {
    // /admin/* is not served by the favicon handler; without a DATABASE_URL the
    // admin db-setter 500s, but the response must never be the icon.
    const res = await app.request('/admin/auth/login', { method: 'POST' });
    expect(res.headers.get('Content-Type')).not.toBe('image/png');
  });
});
