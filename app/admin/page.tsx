import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/modules/panel/auth';

export default async function AdminDashboard() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;

  if (!sessionCookie) {
    redirect('/admin/login');
  }

  const session = await verifySessionToken(sessionCookie);
  if (!session) {
    redirect('/admin/login');
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
      <div className="border border-outline-variant bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Session Info</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground w-24">User ID:</dt>
            <dd className="text-foreground">{session.userId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-muted-foreground w-24">Role:</dt>
            <dd className="text-foreground">{session.role}</dd>
          </div>
        </dl>
      </div>
      <p className="text-muted-foreground">Memory dashboard coming soon.</p>
    </div>
  );
}
