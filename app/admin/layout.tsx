// TODO: protect this layout with auth middleware (verify session/token).
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header style={{ borderBottom: '1px solid #ddd', padding: 12, fontFamily: 'system-ui' }}>
        CortextMCP Admin
      </header>
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>{children}</main>
    </>
  );
}
