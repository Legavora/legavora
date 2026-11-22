
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { browserDb } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function checkRecoveryAuthorization() {
      try {
        const response = await fetch(
          '/api/auth/recovery-status',
          {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
          }
        );

        if (active) {
          setAuthorized(response.ok);
        }
      } catch {
        if (active) {
          setAuthorized(false);
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    void checkRecoveryAuthorization();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy || !authorized || completed) return;

    setErrorMessage('');

    if (password.length < 8 || password.length > 128) {
      setErrorMessage(
        'Password must contain between 8 and 128 characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        '/api/auth/reset-password',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        }
      );

      const result: {
        success?: boolean;
        error?: string;
      } = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            'Unable to update your password.'
        );
      }

      setCompleted(true);
      setAuthorized(false);
      setPassword('');
      setConfirmPassword('');

      // End the browser session after a successful reset.
      try {
        await browserDb().auth.signOut();
      } catch {
        // Password was already updated successfully.
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to update your password.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow">LEGAVORA ACCOUNT SECURITY</p>

      <h1 className="heading text-4xl mt-3">
        Create a new password
      </h1>

      {checking ? (
        <div className="panel mt-8">
          <p className="text-slate-600">
            Verifying your recovery authorization...
          </p>
        </div>
      ) : completed ? (
        <div className="panel mt-8 space-y-4">
          <p role="status" className="text-green-700">
            Your password has been updated successfully.
          </p>

          <Link
            href="/login"
            className="btn inline-block"
          >
            Return to Sign In
          </Link>
        </div>
      ) : !authorized ? (
        <div className="panel mt-8 space-y-4">
          <p className="text-red-700">
            Your recovery link is missing, invalid,
            or has expired.
          </p>

          <Link
            href="/forgot-password"
            className="underline font-semibold"
          >
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="panel mt-8 space-y-5"
        >
          <p className="text-sm text-slate-600">
            Choose a secure new password for your Legavora
            account.
          </p>

          <div>
            <label
              htmlFor="new-password"
              className="field"
            >
              New password
            </label>

            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              disabled={busy}
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="field"
            >
              Confirm new password
            </label>

            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              disabled={busy}
            />
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="text-sm text-red-700"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn w-full"
          >
            {busy
              ? 'Updating Password...'
              : 'Update Password'}
          </button>
        </form>
      )}
    </main>
  );
}
