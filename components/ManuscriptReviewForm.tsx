
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  projectId: string;
  fileId: string;
};

type Decision =
  | 'approved'
  | 'revision_requested'
  | 'rejected';

export default function ManuscriptReviewForm({
  projectId,
  fileId,
}: Props) {
  const router = useRouter();

  const [decision, setDecision] =
    useState<Decision>('revision_requested');

  const [reviewNotes, setReviewNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitting) return;

    setError('');
    setSuccess('');

    if (!reviewNotes.trim()) {
      setError('Please enter your official editorial feedback.');
      return;
    }

    if (!confirmed) {
      setError('Please confirm that this feedback may be shared with the author.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        '/api/admin/manuscript-reviews',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: projectId,
            file_id: fileId,
            decision,
            review_notes: reviewNotes.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            'Unable to publish editorial decision.'
        );
      }

      setSuccess(
        'Official editorial decision published successfully. The author can now access this feedback.'
      );

      setReviewNotes('');
      setConfirmed(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to publish editorial decision.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">
          Official Management Decision
        </p>

        <p className="mt-2">
          Feedback submitted here will be visible to the
          author. Internal specialist recommendations
          remain confidential. Do not include private
          staff discussions or confidential notes.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="review-decision"
          className="block font-semibold"
        >
          Official Editorial Decision
        </label>

        <select
          id="review-decision"
          value={decision}
          onChange={(event) => {
            setDecision(event.target.value as Decision);
            setConfirmed(false);
          }}
          disabled={submitting}
          className="w-full rounded-lg border bg-white p-3 text-slate-900"
          required
        >
          <option value="approved">
            Approve Manuscript
          </option>

          <option value="revision_requested">
            Request Author Revision
          </option>

          <option value="rejected">
            Reject Submission
          </option>
        </select>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="review-notes"
          className="block font-semibold"
        >
          Official Author Feedback
        </label>

        <textarea
          id="review-notes"
          value={reviewNotes}
          onChange={(event) => {
            setReviewNotes(event.target.value);
            setConfirmed(false);
          }}
          placeholder="Provide the official editorial assessment and any required revision instructions for the author."
          rows={7}
          minLength={1}
          maxLength={10000}
          disabled={submitting}
          required
          className="w-full rounded-lg border bg-white p-3 text-slate-900"
        />

        <div className="flex justify-between gap-3 text-xs text-slate-600">
          <span>
            This decision will be preserved in the
            official editorial history.
          </span>

          <span>
            {reviewNotes.length}/10000
          </span>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border p-4">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) =>
            setConfirmed(event.target.checked)
          }
          disabled={submitting}
          required
          className="mt-1 h-4 w-4"
        />

        <span className="text-sm">
          I confirm that this is an official management
          decision and that the feedback is appropriate
          for the author to receive.
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
        >
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={
          submitting ||
          !confirmed ||
          !reviewNotes.trim()
        }
        className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting
          ? 'Publishing Decision...'
          : 'Publish Official Editorial Decision'}
      </button>
    </form>
  );
}
