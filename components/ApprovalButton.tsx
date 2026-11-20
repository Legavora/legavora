
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ApprovalButtonProps = {
  id: string;
};

type Decision = 'approved' | 'corrections_requested';

export default function ApprovalButton({
  id,
}: ApprovalButtonProps) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function submitDecision(decision: Decision) {
    if (busy) return;

    if (
      decision === 'corrections_requested' &&
      !feedback.trim()
    ) {
      setError('Please explain the corrections required.');
      return;
    }

    if (decision === 'approved') {
      const confirmed = window.confirm(
        'Are you sure you want to approve this proof? Your decision will be recorded.'
      );

      if (!confirmed) return;
    }

    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          decision,
          feedback:
            decision === 'corrections_requested'
              ? feedback.trim()
              : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            'Unable to submit your proof decision.'
        );
      }

      setShowCorrections(false);
      setFeedback('');

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-4 md:w-auto">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => submitDecision('approved')}
          className="btn disabled:opacity-50"
        >
          {busy ? 'Processing...' : 'Approve Proof'}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setShowCorrections(!showCorrections);
            setError('');
          }}
          className="rounded-md border border-[#cba45b] px-5 py-3 font-semibold text-[#0b1b2b] transition hover:bg-[#f8f1e4] disabled:opacity-50"
        >
          {showCorrections
            ? 'Cancel Corrections'
            : 'Request Corrections'}
        </button>
      </div>

      {showCorrections && (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <label
            htmlFor={`proof-feedback-${id}`}
            className="block text-sm font-semibold"
          >
            Describe the corrections required
          </label>

          <textarea
            id={`proof-feedback-${id}`}
            value={feedback}
            onChange={(event) => {
              setFeedback(event.target.value);
              setError('');
            }}
            maxLength={5000}
            rows={5}
            disabled={busy}
            placeholder="Explain what needs to be corrected before you can approve this proof."
            className="w-full rounded-md border border-slate-300 p-3 text-sm text-slate-900"
          />

          <p className="text-xs text-slate-500">
            Your feedback will be recorded and shared with
            Legavora's publishing team.
          </p>

          <button
            type="button"
            disabled={busy || !feedback.trim()}
            onClick={() =>
              submitDecision('corrections_requested')
            }
            className="rounded-md bg-[#0b1b2b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? 'Submitting...'
              : 'Submit Correction Request'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
