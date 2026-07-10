'use client';

import { useActionState } from 'react';
import { registerAction } from '@/modules/panel/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface RegisterFormProps {
  enabled: boolean;
}

interface FormState {
  success?: boolean;
  error?: string;
}

export function RegisterForm({ enabled }: RegisterFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState | null, formData: FormData): Promise<FormState> => {
      if (!enabled) {
        return { error: 'Registration is disabled' };
      }
      try {
        const result = await registerAction(formData);
        return result;
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Registration failed' };
      }
    },
    null,
  );

  if (!enabled) {
    return null;
  }

  if (state?.success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Registration submitted</CardTitle>
          <CardDescription className="text-center">
            Your account has been created. An admin will activate it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl text-center">Create account</CardTitle>
        <CardDescription className="text-center">
          Register a new account (requires admin activation)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reg-username">Username</Label>
            <Input id="reg-username" name="username" type="text" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password">Password</Label>
            <Input id="reg-password" name="password" type="password" required />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Registering...' : 'Register'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
