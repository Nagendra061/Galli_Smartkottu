import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { FormField } from '../../../../shared/components/forms/FormField';
import { PasswordInput } from '../../../../shared/components/forms/PasswordInput';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { Button } from '../../../../shared/components/ui/Button';
import { BrandLogo } from '../../../../shared/components/ui/BrandLogo';
import { Card } from '../../../../shared/components/ui/Card';
import { ROUTES, STORAGE_KEYS } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import { smoApi } from '../../services/smoApi';

const schema = z.object({
  identifier: z.string().min(1, 'Enter your email or phone number.'),
  password: z.string().min(1, 'Enter your password.'),
});

export function SmoLoginPage() {
  const { setSession } = useAuth();
  const { data: config } = useBootstrapConfig();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setServerError(null);
    try {
      const res = await smoApi.login(values.identifier, values.password);
      setSession(res.token, res.user);
      const returnTo = sessionStorage.getItem(STORAGE_KEYS.RETURN_TO_PATH);
      sessionStorage.removeItem(STORAGE_KEYS.RETURN_TO_PATH);
      navigate(returnTo && returnTo.startsWith('/owner') ? returnTo : ROUTES.OWNER_ROOT);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Unable to sign in.');
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2 flex flex-col items-center">
          <BrandLogo size="lg" badge="Store Portal" />
          <p className="text-sm text-ink-secondary">Sign in as Store Owner or Staff</p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {serverError && <Alert tone="danger">{serverError}</Alert>}
            <FormField label="Email or Phone" htmlFor="smo-id" error={errors.identifier?.message} required>
              <TextInput
                id="smo-id"
                autoComplete="username"
                hasError={Boolean(errors.identifier)}
                placeholder="owner@store.com or 10-digit phone"
                {...register('identifier')}
              />
            </FormField>
            <FormField label="Password" htmlFor="smo-pw" error={errors.password?.message} required>
              <PasswordInput
                id="smo-pw"
                autoComplete="current-password"
                hasError={Boolean(errors.password)}
                {...register('password')}
              />
            </FormField>
            <Button type="submit" fullWidth isLoading={isSubmitting}>
              Sign in to Store
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
