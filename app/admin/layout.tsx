import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/modules/panel/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;

  if (sessionCookie) {
    const session = await verifySessionToken(sessionCookie);
    if (session) {
      return (
        <>
          <header className="border-b border-border bg-card px-6 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-foreground">CortextMCP Admin</h1>
              <span className="text-sm text-muted-foreground">
                User #{session.userId}
              </span>
            </div>
          </header>
          <main className="p-6">{children}</main>
        </>
      );
    }
  }

  // No valid session — the middleware will redirect to login for protected pages.
  // For the login page itself, just render children.
  return <>{children}</>;
}
