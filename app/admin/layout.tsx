import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/modules/panel/auth';
import { Sidebar } from '@/modules/panel/components/Sidebar';

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
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      );
    }
  }

  // No valid session — the middleware will redirect to login for protected pages.
  // For the login page itself, just render children.
  return <>{children}</>;
}
