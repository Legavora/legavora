
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { browserDb } from '@/lib/supabase-browser';

type AuthFormProps = {
  mode: 'login' | 'register';
};

function getSafeRedirect(next: string | null): string {
  if (!next) {
    return '/dashboard';
  }

  // Only allow internal author project pages.
  // This prevents external or unsafe redirects.
  if (
    /^\/dashboard\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(
      next
    )
  ) {
    return next;
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

  async function submit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage('');

    try {
      const db = browserDb();

      if (mode === 'register') {
        const { error } = await db.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        });

        if (error) {
          throw error;
        }

        setMessage(
          'Registration submitted. Check your email to confirm your account, then sign in.'
        );
      } else {
        const { error } = await db.auth.signInWithPassword({
          email,
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
          : 'Something went wrong';

      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow">AUTHOR WORKSPACE</p>

      <h1 className="heading text-4xl mt-3">
        {mode === 'login'
          ? 'Welcome back'
          : 'Create your author account'}
      </h1>

      <form
        onSubmit={submit}
        className="panel mt-8 space-y-5"
      >
        {mode === 'register' && (
          <div>
            <label className="field">
              Full name
            </label>

            <input
              required
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              autoComplete="name"
            />
          </div>
        )}

        <div>
          <label className="field">
            Email address
          </label>

          <input
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
          <label className="field">
            Password
          </label>

          <input
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
        </div>

        <button
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
                href="/register"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              Already registered?{' '}
              <Link
                className="underline"
                href="/login"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
