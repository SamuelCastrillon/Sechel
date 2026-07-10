import './globals.css';

export const metadata = {
  title: 'CortextMCP',
  description: 'Serverless MCP memory server for AI coding agents',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
