import { LoginForm } from '@/modules/panel/components/LoginForm';

export default async function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <LoginForm />
    </div>
  );
}
