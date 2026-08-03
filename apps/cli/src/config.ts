import { promises as fs } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

export interface CliConfig {
  port?: number;
  host?: string;
  dbPath?: string;
}

const CONFIG_DIR = path.join(homedir(), '.config', 'sechel');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_DB_PATH = path.join(CONFIG_DIR, 'sechel.db');

const DEFAULTS: CliConfig = {
  port: 3030,
  host: 'localhost',
  dbPath: DEFAULT_DB_PATH,
};

/**
 * Get the config directory path (~/.config/sechel/).
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the default database path (~/.config/sechel/sechel.db).
 */
export function getDefaultDbPath(): string {
  return DEFAULT_DB_PATH;
}

/**
 * Ensure the config directory exists, creating it recursively if necessary.
 */
export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

/**
 * Load CLI config from ~/.config/sechel/config.json.
 * Returns default config if the file doesn't exist or can't be read.
 */
export async function loadConfig(): Promise<CliConfig> {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Save CLI config to ~/.config/sechel/config.json.
 */
export async function saveConfig(config: CliConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
