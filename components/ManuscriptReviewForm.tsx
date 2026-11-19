
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!reviewNotes.trim()) {
      setError('Please enter your editorial feedback.');
      return;
    }

    if (submitting) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

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
            'Unable to save editorial review.'
        );
      }

      setSuccess('Editorial review saved successfully.');
      setReviewNotes('');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save editorial review.'
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
      <div className="space-y-2">
        <label
          htmlFor="review-decision"
          className="block font-semibold"
        >
          Editorial Decision
        </label>

        <select
          id="review-decision"
          value={decision}
          onChange={(event) =>
            setDecision(event.target.value as Decision)
          }
          disabled={submitting}
          className="w-full rounded-lg border p-3"
          required
        >
          <option value="approved">
            Approve Manuscript
          </option>

          <option value="revision_requested">
            Request Revision
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
          Editorial Feedback
        </label>

        <textarea
          id="review-notes"
          value={reviewNotes}
          onChange={(event) =>
            setReviewNotes(event.target.value)
          }
          placeholder="Explain your editorial decision and provide specific feedback..."
          rows={7}
          minLength={1}
          maxLength={10000}
          disabled={submitting}
          required
          className="w-full rounded-lg border p-3"
        />

        <p className="text-sm text-slate-600">
          Include clear instructions when requesting revisions.
          Your feedback will be preserved in the review history.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="text-sm text-green-700"
        >
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting
          ? 'Saving Review...'
          : 'Save Editorial Review'}
      </button>
    </form>
  );
}
