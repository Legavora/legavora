
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type Deliverable = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  submission_notes: string;
  status: string;
  management_feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  specialist_name: string;
  assignment_role: string;
};

type Decision =
  | 'approved'
  | 'revision_requested'
  | 'rejected';

function format(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function DeliverableCard({
  deliverable,
}: {
  deliverable: Deliverable;
}) {
  const router = useRouter();

  const [decision, setDecision] =
    useState<Decision>('approved');

  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const pending = deliverable.status === 'pending_review';

  async function download() {
    if (downloading) return;

    setDownloading(true);
    setError('');

    try {
      const db = browserDb();

      const { data, error: downloadError } =
        await db.storage
          .from('staff-deliverables')
          .createSignedUrl(
            deliverable.storage_path,
            60,
            {
              download: deliverable.file_name,
            }
          );

      if (downloadError || !data?.signedUrl) {
        throw new Error(
          'Unable to download this deliverable.'
        );
      }

      window.location.assign(data.signedUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Download failed.'
      );
    } finally {
      setDownloading(false);
    }
  }

  async function submitReview(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy || !pending) return;

    setError('');
    setSuccess('');

    if (
      !feedback.trim() ||
      feedback.trim().length > 5000
    ) {
      setError('Enter valid management feedback.');
      return;
    }

    setBusy(true);

    try {
      const db = browserDb();

      const { data, error: reviewError } =
        await db.rpc('review_staff_deliverable', {
          p_deliverable_id: deliverable.id,
          p_decision: decision,
          p_feedback: feedback.trim(),
        });

      if (reviewError || !data) {
        throw new Error(
          'Unable to save the decision. Refresh the page before retrying.'
        );
      }

      setSuccess(
        'Management decision recorded successfully.'
      );

      setFeedback('');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to review deliverable.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold break-all">
            {deliverable.file_name}
          </h3>

          <p className="text-sm text-slate-600 mt-2">
            {format(deliverable.assignment_role)}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            deliverable.status === 'approved'
              ? 'bg-green-100 text-green-800'
              : deliverable.status === 'rejected'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-900'
          }`}
        >
          {format(deliverable.status)}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 text-sm">
        <p>
          <strong>Submitted by:</strong>{' '}
          {deliverable.specialist_name}
        </p>

        <p>
          <strong>Submitted:</strong>{' '}
          {formatDate(deliverable.created_at)}
        </p>

        <p>
          <strong>File size:</strong>{' '}
          {(deliverable.size_bytes / 1048576).toFixed(2)} MB
        </p>

        {deliverable.reviewed_at && (
          <p>
            <strong>Reviewed:</strong>{' '}
            {formatDate(deliverable.reviewed_at)}
          </p>
        )}
      </div>

      <div className="rounded-lg bg-slate-50 p-4 text-slate-900">
        <h4 className="font-semibold text-sm">
          Specialist Submission Notes
        </h4>

        <p className="text-sm whitespace-pre-wrap break-words mt-2">
          {deliverable.submission_notes}
        </p>
      </div>

      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="rounded-lg border px-5 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {downloading
          ? 'Preparing Download...'
          : 'Download Deliverable'}
      </button>

      {pending ? (
        <form
          onSubmit={submitReview}
          className="border-t pt-5 space-y-4"
        >
          <h4 className="font-semibold">
            Management Quality Review
          </h4>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Review Decision
            </span>

            <select
              value={decision}
              onChange={(event) =>
                setDecision(
                  event.target.value as Decision
                )
              }
              disabled={busy}
              className="w-full rounded-lg border bg-white p-3 text-slate-900"
            >
              <option value="approved">
                Approve Deliverable
              </option>

              <option value="revision_requested">
                Request Corrections
              </option>

              <option value="rejected">
                Reject Deliverable
              </option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Management Feedback
            </span>

            <textarea
              value={feedback}
              onChange={(event) =>
                setFeedback(event.target.value)
              }
              required
              maxLength={5000}
              rows={5}
              disabled={busy}
              placeholder="Record your assessment, required corrections or approval instructions."
              className="w-full rounded-lg border bg-white p-3 text-slate-900"
            />
          </label>

          <p className="text-xs text-slate-600">
            This feedback is internal. Approval does
            not automatically release the file to the
            author or complete a production stage.
          </p>

          <button
            type="submit"
            disabled={busy || !feedback.trim()}
            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? 'Saving Decision...'
              : 'Save Management Decision'}
          </button>
        </form>
      ) : (
        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-semibold text-sm">
            Management Feedback
          </h4>

          <p className="text-sm whitespace-pre-wrap break-words">
            {deliverable.management_feedback ||
              'No written feedback recorded.'}
          </p>
        </div>
      )}

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
    </article>
  );
}

export default function ManagementDeliverableReview({
  deliverables,
}: {
  deliverables: Deliverable[];
}) {
  const pendingCount = deliverables.filter(
    (item) => item.status === 'pending_review'
  ).length;

  const approvedCount = deliverables.filter(
    (item) => item.status === 'approved'
  ).length;

  const revisionCount = deliverables.filter(
    (item) => item.status === 'revision_requested'
  ).length;

  return (
    <section className="panel space-y-6">
      <div className="space-y-2">
        <h2>Staff Production Deliverables</h2>

        <p className="text-sm text-slate-600">
          Review completed production work submitted
          by assigned Legavora specialists.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            label: 'Awaiting Review',
            count: pendingCount,
          },
          {
            label: 'Approved',
            count: approvedCount,
          },
          {
            label: 'Corrections Requested',
            count: revisionCount,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border p-4"
          >
            <p className="text-sm text-slate-600">
              {item.label}
            </p>

            <p className="text-3xl font-bold mt-2">
              {item.count}
            </p>
          </div>
        ))}
      </div>

      {deliverables.length === 0 ? (
        <p className="text-sm text-slate-600">
          No staff deliverables have been submitted
          for this project.
        </p>
      ) : (
        <div className="space-y-5">
          {deliverables.map((deliverable) => (
            <DeliverableCard
              key={deliverable.id}
              deliverable={deliverable}
            />
          ))}
        </div>
      )}
    </section>
  );
}
