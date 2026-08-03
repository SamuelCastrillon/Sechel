import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// RED — P-4.3: Config/DB at ~/.config/sechel/, auto-create on first run
// Tests reference config module that does NOT exist yet
// ---------------------------------------------------------------------------

// Mock fs and os modules before importing config
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
}));

const CONFIG_DIR = path.join('/home/testuser', '.config', 'sechel');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_DB = path.join(CONFIG_DIR, 'sechel.db');

describe('config — P-4.3 RED', () => {
  let fsMod: { promises: { mkkdir: any; readFile: any; writeFile: any } };
  let config: typeof import('../src/config');

  beforeEach(async () => {
    // Reset mocks before each test
    vi.resetAllMocks();
    // Re-import to get fresh mock state
    config = await import('../src/config');
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('getConfigDir returns ~/.config/sechel/', () => {
    expect(config.getConfigDir()).toBe(CONFIG_DIR);
  });

  it('getDefaultDbPath returns ~/.config/sechel/sechel.db', () => {
    expect(config.getDefaultDbPath()).toBe(DEFAULT_DB);
  });

  it('loadConfig returns defaults when no config file exists', async () => {
    const fs = await import('node:fs');
    // Make readFile throw (file doesn't exist)
    (fs.promises.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ENOENT'),
    );

    const cfg = await config.loadConfig();
    expect(cfg.port).toBe(3030);
    expect(cfg.host).toBe('localhost');
    expect(cfg.dbPath).toBe(DEFAULT_DB);
  });

  it('loadConfig reads and parses existing config file', async () => {
    const fs = await import('node:fs');
    (fs.promises.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ port: 8080, host: '0.0.0.0' }),
    );

    const cfg = await config.loadConfig();
    expect(cfg.port).toBe(8080);
    expect(cfg.host).toBe('0.0.0.0');
    // dbPath should fall back to default
    expect(cfg.dbPath).toBe(DEFAULT_DB);
  });

  it('saveConfig writes config to file with correct path', async () => {
    const fs = await import('node:fs');
    (fs.promises.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    await config.saveConfig({ port: 3030, host: 'localhost', dbPath: '/custom/db.db' });

    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      CONFIG_FILE,
      JSON.stringify({ port: 3030, host: 'localhost', dbPath: '/custom/db.db' }, null, 2),
      'utf-8',
    );
  });

  it('ensureConfigDir creates directory recursively', async () => {
    const fs = await import('node:fs');
    (fs.promises.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await config.ensureConfigDir();

    expect(fs.promises.mkdir).toHaveBeenCalledWith(CONFIG_DIR, {
      recursive: true,
    });
  });
});
