import { requireAdmin } from '@/modules/panel/auth';
import { createLibsqlClient } from '@/modules/core/db';
import { getSettingsInternal } from '@/modules/panel/actions/settings';
import { SettingsForm } from '@/modules/panel/components/SettingsForm';
import { ChangePasswordForm } from '@/modules/panel/components/ChangePasswordForm';

export default async function AdminSettingsPage() {
  await requireAdmin();

  const client = createLibsqlClient();
  try {
    const settings = await getSettingsInternal(client);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Instance-wide configuration settings.</p>
        </div>

        <SettingsForm initialSettings={settings as any[]} />

        <ChangePasswordForm />
      </div>
    );
  } finally {
    client.close();
  }
}
