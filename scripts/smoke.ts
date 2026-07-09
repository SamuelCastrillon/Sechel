import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.env.MCP_BASE_URL ?? 'http://localhost:3000/api/mcp';
const token = process.env.CORTEXT_DEV_TOKEN ?? 'dev-admin-token';

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(transport);
  console.log('connected');

  const ping = await client.callTool({ name: 'ping', arguments: {} });
  console.log('PING:', JSON.stringify(ping));

  const save = await client.callTool({
    name: 'mem_save',
    arguments: {
      type: 'decision',
      title: 'smoke test memory',
      content: 'created by local smoke test against deployed Turso',
      project: 'smoke',
      topic_key: 'smoke/test',
    },
  });
  console.log('SAVE:', JSON.stringify(save));

  const search = await client.callTool({
    name: 'mem_search',
    arguments: { query: 'smoke', project: 'smoke' },
  });
  console.log('SEARCH:', JSON.stringify(search));

  await client.close();
  console.log('smoke test done');
}

main().catch((e) => {
  console.error('smoke failed:', e);
  process.exit(1);
});
