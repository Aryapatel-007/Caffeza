import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import BrandLogo from '../../components/ui/BrandLogo.jsx';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeProvider.jsx';

/**
 * Sign in. P22, DESIGN-SYSTEM sections 4d and 11b.
 *
 * The one screen where the brand gets a large surface. It is drawn in the look
 * of the last restaurant signed in on this device, kept with the device's
 * settings, because nobody has signed in yet to ask the server.
 *
 * With a brand colour: from 900px a full-height `brand` panel on the left,
 * about 40% of the width, with the logo centred, and the form on `ground` to
 * its right; below 900px a 180px `brand` band across the top. The logo is on
 * its own background colour, so it blends into the panel with no edge. No
 * tagline is added: the logo already carries one.
 *
 * Without one, the screen is as it was before P22, with the restaurant's name,
 * or the product's, in place of a hardcoded client's.
 */
/**
 * The brand panel: the logo centred on `brand`, or the name in `on-brand` when
 * there is no logo. Exported so the Appearance page previews the real thing.
 * `compact` draws the 180px band a phone shows, at any width.
 */
export function BrandPanel({ compact = false, className = '' }) {
  const { name } = useTheme();
  if (compact) {
    return (
      <section aria-label={name} className={`flex h-[180px] items-center justify-center bg-brand px-6 ${className}`}>
        <BrandLogo ground="dark" height={120} maxWidth={240} textClassName="type-title text-on-brand" />
      </section>
    );
  }
  return (
    <section
      aria-label={name}
      className={`flex h-[180px] flex-none items-center justify-center bg-brand px-6 min-[900px]:h-auto min-[900px]:min-h-full min-[900px]:w-2/5 ${className}`}
    >
      <BrandLogo ground="dark" height={120} maxWidth={240} textClassName="type-title text-on-brand" className="min-[900px]:hidden" />
      <BrandLogo ground="dark" height={148} maxWidth={240} textClassName="type-title text-on-brand" className="hidden min-[900px]:flex" />
    </section>
  );
}

export default function LoginPage() {
  const { brand, name } = useTheme();
  const isBranded = Boolean(brand.brandHex && brand.onBrandHex);
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

  const form = (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
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
  );

  const greeting = (
    <>
      <h2 className="type-title text-ink">Welcome back</h2>
      <p className="type-body mt-1 text-muted">Sign in to start your shift.</p>
    </>
  );

  const footnote = <p className="type-caption mt-6 text-muted">Accounts are created by your administrator. There is no self signup.</p>;

  if (isBranded) {
    return (
      <main className="flex min-h-full flex-col bg-ground min-[900px]:flex-row">
        <BrandPanel />

        <section className="flex flex-1 items-start bg-ground px-4 py-8 min-[900px]:items-center min-[900px]:px-12">
          <div className="w-full max-w-[400px]">
            {greeting}
            {form}
            {footnote}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-col bg-surface lg:flex-row">
      <section className="flex min-h-[260px] flex-col justify-end bg-ink p-8 text-surface lg:min-h-full lg:w-[55%] lg:p-12">
        <h1 className="type-heading">{name}</h1>
      </section>

      <section className="flex flex-1 items-center bg-surface px-4 py-8 lg:p-12">
        <div className="w-full max-w-[400px]">
          {greeting}
          {form}
          {footnote}
        </div>
      </section>
    </main>
  );
}
