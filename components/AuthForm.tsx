
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { browserDb } from '@/lib/supabase-browser';

type AuthFormProps = {
  mode: 'login' | 'register';
};

const PROJECT_PATH =
  /^\/dashboard\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;

const INVITATION_TOKEN = /^[a-f0-9]{64}$/i;

function getSafeRedirect(next: string | null): string {
  if (!next) {
    return '/dashboard';
  }

  if (PROJECT_PATH.test(next)) {
    return next;
  }

  // Only permit the exact staff invitation route
  // with a valid token format.
  if (next.startsWith('/staff/accept-invitation?')) {
    try {
      const url = new URL(next, 'https://legavora.invalid');

      if (
        url.pathname === '/staff/accept-invitation' &&
        url.searchParams.size === 1 &&
        INVITATION_TOKEN.test(
          url.searchParams.get('token') ?? ''
        )
      ) {
        return (
          '/staff/accept-invitation?token=' +
          encodeURIComponent(
            url.searchParams.get('token')!
          )
        );
      }
    } catch {
      return '/dashboard';
    }
  }

  return '/dashboard';
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = getSafeRedirect(
    searchParams.get('next')
  );

  const hasInvitation =
    redirectTo.startsWith('/staff/accept-invitation?');

  const alternatePath =
    (mode === 'login' ? '/register' : '/login') +
    (hasInvitation
      ? '?next=' + encodeURIComponent(redirectTo)
      : '');

  async function submit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setMessage('');

    try {
      const db = browserDb();

      if (mode === 'register') {
        const { data, error } = await db.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: name.trim(),
            },
          },
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          router.push(redirectTo);
          router.refresh();
          return;
        }

        setMessage(
          'Registration submitted. Please check your email to confirm your account. After confirmation, return to this page and sign in.'
        );
      } else {
        const { error } = await db.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          throw error;
        }

        router.push(redirectTo);
        router.refresh();
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.';

      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow">
        {hasInvitation
          ? 'LEGAVORA TEAM ONBOARDING'
          : 'AUTHOR WORKSPACE'}
      </p>

      <h1 className="heading text-4xl mt-3">
        {mode === 'login'
          ? 'Welcome back'
          : hasInvitation
            ? 'Create your team account'
            : 'Create your author account'}
      </h1>

      {hasInvitation && (
        <p className="mt-4 text-sm text-slate-600">
          Sign in or register using the email address
          that received your Legavora staff invitation.
          Your staff role will only be activated after
          your invitation is accepted.
        </p>
      )}

      <form
        onSubmit={submit}
        className="panel mt-8 space-y-5"
      >
        {mode === 'register' && (
          <div>
            <label
              htmlFor="auth-name"
              className="field"
            >
              Full name
            </label>

            <input
              id="auth-name"
              required
              maxLength={250}
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              autoComplete="name"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="auth-email"
            className="field"
          >
            Email address
          </label>

          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            autoComplete="email"
          />
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="field"
          >
            Password
          </label>

          <input
            id="auth-password"
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            autoComplete={
              mode === 'register'
                ? 'new-password'
                : 'current-password'
            }
          />

          {mode === 'login' && (
            <div className="mt-3 text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-[#a67c36] underline underline-offset-4"
              >
                Forgot Password?
              </Link>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn w-full"
        >
          {busy
            ? 'Please wait…'
            : mode === 'login'
              ? 'Sign In'
              : 'Create Account'}
        </button>

        {message && (
          <p
            role="status"
            className="text-sm text-slate-700"
          >
            {message}
          </p>
        )}

        <p className="text-sm text-slate-600">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <Link
                className="underline"
                href={alternatePath}
              >
                Register
              </Link>
            </>
          ) : (
            <>
              Already registered?{' '}
              <Link
                className="underline"
                href={alternatePath}
              >
                Sign in
              </Link>
            </>
          )}
        </p>

        {hasInvitation && (
          <p className="text-sm text-slate-600">
            <Link
              href={redirectTo}
              className="underline"
            >
              Return to Staff Invitation
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
