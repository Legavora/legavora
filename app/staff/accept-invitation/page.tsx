
'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type Invitation = {
  email: string;
  role: 'manager' | 'specialist';
  expires_at: string;
};

type AccountState = {
  email: string;
  confirmed: boolean;
};

function StaffInvitationContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [checking, setChecking] = useState(true);
  const [invitation, setInvitation] =
    useState<Invitation | null>(null);
  const [account, setAccount] =
    useState<AccountState | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadInvitation() {
      if (!token) {
        setErrorMessage(
          'This invitation link is missing its security token.'
        );
        setChecking(false);
        return;
      }

      try {
        const response = await fetch(
          '/api/staff/invitations/verify',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
            cache: 'no-store',
          }
        );

        const result = await response.json();

        if (!response.ok || !result.valid) {
          throw new Error(
            result.error ||
              'This invitation is invalid or has expired.'
          );
        }

        const db = browserDb();

        const {
          data: { user },
          error: authError,
        } = await db.auth.getUser();

        if (!active) return;

        if (authError) {
          console.error(
            'Unable to check current account:',
            authError
          );
        }

        setInvitation(result.invitation);

        if (user) {
          setAccount({
            email: user.email ?? '',
            confirmed: Boolean(user.email_confirmed_at),
          });
        }
      } catch (error: unknown) {
        if (!active) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to verify this invitation.'
        );
      } finally {
        if (active) setChecking(false);
      }
    }

    void loadInvitation();

    return () => {
      active = false;
    };
  }, [token]);

  const roleName =
    invitation?.role === 'manager'
      ? 'Publishing Manager'
      : 'Publishing Specialist';

  const emailMatches =
    Boolean(account && invitation) &&
    account!.email.trim().toLowerCase() ===
      invitation!.email.trim().toLowerCase();

  const canActivate =
    Boolean(account?.confirmed) &&
    emailMatches &&
    !activated;

  async function activateAccount() {
    if (!canActivate || activating) return;

    setActivating(true);
    setActionMessage('');

    try {
      const response = await fetch(
        '/api/staff/invitations/accept',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({ token }),
          cache: 'no-store',
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            'Unable to activate your staff account.'
        );
      }

      setActivated(true);
      setActionMessage(
        'Your Legavora staff account has been activated successfully.'
      );
    } catch (error: unknown) {
      setActionMessage(
        error instanceof Error
          ? error.message
          : 'Unable to activate your staff account.'
      );
    } finally {
      setActivating(false);
    }
  }

  const returnPath =
    '/staff/accept-invitation?token=' +
    encodeURIComponent(token);

  const loginPath =
    '/login?next=' + encodeURIComponent(returnPath);

  const registerPath =
    '/register?next=' + encodeURIComponent(returnPath);

  return (
    <main className="max-w-xl mx-auto px-5 py-20">
      <p className="eyebrow">JOIN THE LEGAVORA TEAM</p>

      <h1 className="heading text-4xl mt-3">
        Accept Your Invitation
      </h1>

      {checking ? (
        <div className="panel mt-8">
          <p className="text-slate-600">
            Verifying your invitation...
          </p>
        </div>
      ) : errorMessage ? (
        <div className="panel mt-8 space-y-4">
          <p role="alert" className="text-red-700">
            {errorMessage}
          </p>

          <p className="text-sm text-slate-600">
            Please contact your Legavora administrator
            if you need a new invitation.
          </p>

          <Link
            href="/"
            className="underline font-semibold"
          >
            Return to Legavora
          </Link>
        </div>
      ) : invitation ? (
        <div className="panel mt-8 space-y-5">
          <p className="text-slate-700">
            You&apos;ve been invited to join Legavora as a
            <strong> {roleName}</strong>.
          </p>

          <div className="border rounded-lg p-4 space-y-2">
            <p className="text-sm text-slate-500">
              Invitation email
            </p>

            <p className="font-semibold break-all">
              {invitation.email}
            </p>
          </div>

          {activated ? (
            <div className="space-y-4">
              <p
                role="status"
                className="text-green-700 font-semibold"
              >
                {actionMessage}
              </p>

              <Link
                href="/dashboard"
                className="btn inline-block"
              >
                Continue to Dashboard
              </Link>
            </div>
          ) : !account ? (
            <div className="space-y-4">
              <p className="text-slate-700">
                To accept this invitation, sign in or
                create an account using the email
                address shown above.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href={loginPath} className="btn">
                  Sign In
                </Link>

                <Link
                  href={registerPath}
                  className="underline font-semibold self-center"
                >
                  Create Account
                </Link>
              </div>
            </div>
          ) : !emailMatches ? (
            <div className="space-y-4">
              <p role="alert" className="text-red-700">
                You are currently signed in as
                {' '}{account.email}.
              </p>

              <p className="text-sm text-slate-600">
                This account does not match the invitation
                email. Please sign out and sign in with
                the invited email address.
              </p>

              <Link
                href={loginPath}
                className="underline font-semibold"
              >
                Go to Sign In
              </Link>
            </div>
          ) : !account.confirmed ? (
            <div className="space-y-4">
              <p className="text-slate-700">
                Your email address must be confirmed
                before your staff account can be activated.
              </p>

              <p className="text-sm text-slate-600">
                Please check your email for the
                confirmation message, then return to
                this invitation link.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-slate-700">
                Your invitation has been verified and
                your email address is confirmed.
              </p>

              <p className="text-sm text-slate-600">
                Select the button below to activate
                your Legavora staff account.
              </p>

              <button
                type="button"
                onClick={activateAccount}
                disabled={activating}
                className="btn w-full"
              >
                {activating
                  ? 'Activating Account...'
                  : 'Accept Invitation & Activate Account'}
              </button>

              {actionMessage && (
                <p
                  role="status"
                  className="text-sm text-slate-700"
                >
                  {actionMessage}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}

export default function AcceptStaffInvitationPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-xl mx-auto px-5 py-20">
          <p className="eyebrow">
            JOIN THE LEGAVORA TEAM
          </p>

          <h1 className="heading text-4xl mt-3">
            Accept Your Invitation
          </h1>

          <div className="panel mt-8">
            <p className="text-slate-600">
              Loading invitation...
            </p>
          </div>
        </main>
      }
    >
      <StaffInvitationContent />
    </Suspense>
  );
}
