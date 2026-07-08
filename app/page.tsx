import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>CortextMCP</h1>
      <p>Serverless MCP memory server for AI coding agents.</p>
      <p>
        <Link href="/admin">Open admin panel</Link>
      </p>
    </main>
  );
}
