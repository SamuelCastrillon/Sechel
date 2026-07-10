import { createClient } from '@libsql/client';
import { resolveUrl } from '@/modules/core/db';
import { RegisterForm } from '@/modules/panel/components/RegisterForm';

async function getRegistrationEnabled(): Promise<boolean> {
  try {
    const client = createClient(resolveUrl());
    const res = await client.execute({
      sql: `SELECT value FROM instance_settings WHERE key = 'registration_enabled'`,
    });
    client.close();
    return res.rows.length > 0 && (res.rows[0] as Record<string, unknown>).value === '1';
  } catch {
    return false;
  }
}

export default async function AdminRegisterPage() {
  const registrationEnabled = await getRegistrationEnabled();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <RegisterForm enabled={registrationEnabled} />
    </div>
  );
}
