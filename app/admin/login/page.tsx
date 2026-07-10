import { createClient } from '@libsql/client';
import { resolveUrl, TENANT_ID } from '@/modules/core/db';
import { LoginForm } from '@/modules/panel/components/LoginForm';
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

export default async function AdminLoginPage() {
  const registrationEnabled = await getRegistrationEnabled();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-6">
        <LoginForm />
        {registrationEnabled && <RegisterForm enabled={true} />}
      </div>
    </div>
  );
}
