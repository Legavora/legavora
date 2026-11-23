
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

type NoticeType = 'success' | 'warning' | 'error' | '';

export default function StaffInvitationForm() {
  const router = useRouter();
  const sendingRef = useRef(false);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('specialist');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] =
    useState<NoticeType>('');

  function clearNotice() {
    setNotice('');
    setNoticeType('');
  }

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
    clearNotice();

    try {
      const response = await fetch(
        '/api/staff/invitations',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: normalizedEmail,
            role,
          }),
          cache: 'no-store',
        }
      );

      const result: ApiResponse =
        await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            'Unable to create staff invitation.'
        );
      }

      if (result.emailSent === true) {
        setNotice(
          `Invitation email sent successfully to ${normalizedEmail}. The recipient must verify their email and accept the invitation before receiving staff access.`
        );
        setNoticeType('success');

        setEmail('');
        setRole('specialist');
      } else {
        setNotice(
          result.message ||
            'The invitation record was created, but email delivery has not been confirmed. Check the invitation record and email delivery configuration before trying again.'
        );
        setNoticeType('warning');
      }

      router.refresh();
    } catch (error: unknown) {
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

  const noticeClasses =
    noticeType === 'success'
      ? 'rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900'
      : noticeType === 'warning'
        ? 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
        : 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900';

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="heading text-3xl">
            Invite Staff Member
          </h2>

          <p className="text-slate-600 mt-3">
            Send a secure invitation to a publishing
            manager or specialist to join the
            Legavora team.
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
              clearNotice();
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
              setRole(
                event.target.value as StaffRole
              );
              clearNotice();
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

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Staff members receive an invitation by email.
          Access is granted only after they sign in
          with the invited email address, confirm
          their email, and successfully accept
          the invitation.
        </div>

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={noticeClasses}
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
              ? 'Sending Invitation...'
              : 'Send Staff Invitation'}
          </button>
        </div>
      </form>
    </div>
  );
}
