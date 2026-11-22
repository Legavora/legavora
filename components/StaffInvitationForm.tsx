
'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type StaffRole = 'manager' | 'specialist';

type ApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  emailSent?: boolean;
};

export default function StaffInvitationForm() {
  const router = useRouter();
  const sendingRef = useRef(false);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('specialist');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<
    'success' | 'error' | ''
  >('');

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (sendingRef.current) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setNotice('Please enter an email address.');
      setNoticeType('error');
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setNotice('');
    setNoticeType('');

    try {
      const response = await fetch('/api/staff/invitations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          role,
        }),
      });

      const result: ApiResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || 'Unable to create staff invitation.'
        );
      }

      setEmail('');
      setRole('specialist');

      setNotice(
        'Invitation record created successfully. Email delivery and account activation are not enabled yet.'
      );
      setNoticeType('success');

      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'
      );
      setNoticeType('error');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="heading text-3xl">
            Invite Staff Member
          </h2>

          <p className="text-slate-600 mt-3">
            Create an invitation for a publishing manager
            or specialist to join the Legavora team.
          </p>
        </div>

        <span className="text-xs font-semibold text-slate-600">
          Administrator Only
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-5"
      >
        <div>
          <label
            htmlFor="staff-invitation-email"
            className="block text-sm font-semibold mb-2"
          >
            Staff Email Address
          </label>

          <input
            id="staff-invitation-email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setNotice('');
              setNoticeType('');
            }}
            placeholder="team.member@example.com"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900"
            disabled={sending}
          />
        </div>

        <div>
          <label
            htmlFor="staff-invitation-role"
            className="block text-sm font-semibold mb-2"
          >
            Staff Role
          </label>

          <select
            id="staff-invitation-role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as StaffRole);
              setNotice('');
              setNoticeType('');
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900"
            disabled={sending}
          >
            <option value="specialist">
              Publishing Specialist
            </option>
            <option value="manager">
              Publishing Manager
            </option>
          </select>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This development version creates an invitation
          record only. It does not send an email or grant
          staff access.
        </div>

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={
              noticeType === 'success'
                ? 'rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900'
                : 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
            }
          >
            {notice}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-[#101b33] px-6 py-3 font-semibold text-white disabled:opacity-60"
          >
            {sending
              ? 'Creating Invitation...'
              : 'Create Staff Invitation'}
          </button>
        </div>
      </form>
    </div>
  );
}
