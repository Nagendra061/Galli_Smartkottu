import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../../shared/components/feedback/Alert';
import { FormField } from '../../../shared/components/forms/FormField';
import { PasswordInput } from '../../../shared/components/forms/PasswordInput';
import { TextInput } from '../../../shared/components/forms/TextInput';
import { Button } from '../../../shared/components/ui/Button';
import { BrandLogo } from '../../../shared/components/ui/BrandLogo';
import { Card } from '../../../shared/components/ui/Card';
import { ROUTES, STORAGE_KEYS } from '../../../shared/config/routes';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../shared/hooks/useBootstrapConfig';
import { adminApi } from '../services/adminApi';

const loginSchema = z.object({
  identifier: z.string().email('Enter a valid admin email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function AdminLoginPage() {
  const { setSession } = useAuth();
  const { data: config } = useBootstrapConfig();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const res = await adminApi.login(values.identifier, values.password);
      setSession(res.token, res.user);
      const returnTo = sessionStorage.getItem(STORAGE_KEYS.RETURN_TO_PATH);
      sessionStorage.removeItem(STORAGE_KEYS.RETURN_TO_PATH);
      navigate(returnTo && returnTo.startsWith('/admin') ? returnTo : ROUTES.ADMIN_ROOT);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Unable to sign in.');
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2 flex flex-col items-center">
          <BrandLogo size="lg" badge="Super Admin" />
          <p className="text-sm text-ink-secondary">Platform control tower sign in</p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {serverError && <Alert tone="danger">{serverError}</Alert>}
            <FormField label="Admin email" htmlFor="admin-email" error={errors.identifier?.message} required>
              <TextInput
                id="admin-email"
                type="email"
                autoComplete="email"
                hasError={Boolean(errors.identifier)}
                placeholder="admin@example.com"
                {...register('identifier')}
              />
            </FormField>

            <FormField label="Password" htmlFor="admin-password" error={errors.password?.message} required>
              <PasswordInput
                id="admin-password"
                autoComplete="current-password"
                hasError={Boolean(errors.password)}
                {...register('password')}
              />
            </FormField>

            <Button type="submit" fullWidth isLoading={isSubmitting}>
              Sign in to Admin
            </Button>
          </form>
        </Card>

        <div className="text-center">
          <Link to={ROUTES.HOME} className="text-xs font-medium text-ink-secondary hover:text-ink-primary">
            Back to portal hub
          </Link>
        </div>
      </div>
    </div>
  );
}
