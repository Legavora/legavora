
'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Invitation = {
  email: string;
  role: 'manager' | 'specialist';
  expires_at: string;
};

function StaffInvitationContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [checking, setChecking] = useState(true);
  const [invitation, setInvitation] =
    useState<Invitation | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function checkInvitation() {
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

        if (!active) return;

        if (!response.ok || !result.valid) {
          throw new Error(
            result.error ||
              'This invitation is invalid or has expired.'
          );
        }

        setInvitation(result.invitation);
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

    void checkInvitation();

    return () => {
      active = false;
    };
  }, [token]);

  const roleName =
    invitation?.role === 'manager'
      ? 'Publishing Manager'
      : 'Publishing Specialist';

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
            to request a new invitation.
          </p>

          <Link href="/" className="underline font-semibold">
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

          <p className="text-sm text-slate-600">
            Your invitation has been verified.
            Secure account activation will be available
            once the staff onboarding process is enabled.
          </p>

          <p className="text-sm text-slate-500">
            This invitation does not grant staff access
            until account activation is completed.
          </p>
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
          <p className="eyebrow">JOIN THE LEGAVORA TEAM</p>

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
