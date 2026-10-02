import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { LOGO } from '../brand/logo.js';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Where they were headed before ProtectedRoute sent them here.
  const destination = location.state?.from?.pathname ?? '/dashboard';

  // Someone already signed in has no business on this screen. Rendering a
  // redirect rather than calling navigate() during render, which is a side
  // effect in the render phase and warns under StrictMode.
  if (isAuthenticated) return <Navigate to={destination} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // An "@" means it is an email, otherwise it is a phone number. The server
      // takes exactly one of the two.
      const value = identifier.trim();
      const credentials = value.includes('@')
        ? { email: value, password }
        : { phone: value, password };
      await login(credentials);
      navigate(destination, { replace: true });
    } catch (loginError) {
      /**
       * Whatever went wrong, the server says the same thing: the phone number
       * or password is incorrect. Do not try to be more helpful here. A
       * friendlier message like "this account is deactivated" would confirm
       * the account exists, which is the leak the server works to avoid.
       */
      setError(loginError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-full flex-col bg-surface lg:flex-row">
      <section className="flex min-h-[260px] flex-col items-center justify-center gap-4 bg-brand p-8 text-brand-ink lg:min-h-full lg:w-[55%] lg:p-14">
        <h1>
          <img src={LOGO} alt="Cafezza, be caffeinated" className="w-56 lg:w-96" />
        </h1>
        <span className="type-caption rounded-full border border-brand-ink/40 px-3 py-1">Gandhinagar</span>
      </section>

      <section className="flex flex-1 items-center justify-center bg-surface p-6 lg:p-14">
        <div className="w-full max-w-md">
          <h2 className="type-title text-ink">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-muted">Sign in to start your shift.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Input
              label="Phone or email"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              hint="10-digit mobile number, or the email on your account"
              disabled={isSubmitting}
            />

            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
            />

            {error && <ErrorMessage error={error} />}

            <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Accounts are created by your administrator. There is no self signup.
          </p>
        </div>
      </section>
    </main>
  );
}
