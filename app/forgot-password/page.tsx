
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { browserDb } from '@/lib/supabase-browser';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setMessage('');
    setErrorMessage('');

    try {
      const db = browserDb();

      const redirectTo =
        `${window.location.origin}/auth/confirm` +
        '?next=/reset-password';

      const { error } = await db.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );

      if (error) {
        throw error;
      }

      setMessage(
        'If an account exists for this email address, ' +
        'you will receive a password-reset email shortly. ' +
        'Please check your inbox and spam folder.'
      );

      setEmail('');
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to request a password reset. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow">LEGAVORA ACCOUNT SECURITY</p>

      <h1 className="heading text-4xl mt-3">
        Reset your password
      </h1>

      <p className="text-slate-600 mt-4">
        Enter the email address associated with your
        Legavora account. We&apos;ll send you a secure
        password-reset link.
      </p>

      <form
        onSubmit={handleSubmit}
        className="panel mt-8 space-y-5"
      >
        <div>
          <label
            htmlFor="recovery-email"
            className="field"
          >
            Email address
          </label>

          <input
            id="recovery-email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            disabled={busy}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn w-full"
        >
          {busy
            ? 'Sending reset link...'
            : 'Send Password Reset Link'}
        </button>

        {message && (
          <p
            role="status"
            className="text-sm text-green-700"
          >
            {message}
          </p>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="text-sm text-red-700"
          >
            {errorMessage}
          </p>
        )}

        <p className="text-sm text-slate-600">
          Remember your password?{' '}
          <Link
            href="/login"
            className="underline font-semibold"
          >
            Back to Sign In
          </Link>
        </p>
      </form>
    </main>
  );
}
