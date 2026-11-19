
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type AdminToolsProps = {
  projectId: string;
  currentStage: string;
  currentStatus: string;
};

const stages = [
  {
    value: 'assessment',
    label: 'Manuscript Assessment',
    description:
      'Review the submitted manuscript, author requirements, and publishing needs.',
  },
  {
    value: 'agreement',
    label: 'Publishing Agreement',
    description:
      'Confirm the publishing services, project scope, and agreement.',
  },
  {
    value: 'editing',
    label: 'Editing & Proofreading',
    description:
      'Manage manuscript editing, proofreading, and editorial corrections.',
  },
  {
    value: 'cover_design',
    label: 'Cover Design',
    description:
      'Develop and review the book cover for the required editions.',
  },
  {
    value: 'formatting',
    label: 'Book Formatting',
    description:
      'Prepare the manuscript for ebook and print publication.',
  },
  {
    value: 'proof_approval',
    label: 'Proof Approval',
    description:
      'Confirm that final proofs have been reviewed and approved.',
  },
  {
    value: 'distribution',
    label: 'Publishing & Distribution',
    description:
      'Prepare approved editions for distribution through authorized platforms.',
  },
  {
    value: 'published',
    label: 'Published',
    description:
      'Record publication and verify the available retailer listings.',
  },
  {
    value: 'completed',
    label: 'Project Completed',
    description:
      'Close the project after all agreed publishing services are delivered.',
  },
];

const statuses = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'Under Review' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting_author', label: 'Awaiting Author' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
];

export default function AdminTools({
  projectId,
  currentStage,
  currentStatus,
}: AdminToolsProps) {
  const [stage, setStage] = useState(currentStage);
  const [status, setStatus] = useState(currentStatus);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setStage(currentStage);
    setStatus(currentStatus);
    setMessage('');
  }, [projectId, currentStage, currentStatus]);

  const stageIndex = stages.findIndex(
    (item) => item.value === stage
  );

  const selectedStage = stages[stageIndex];

  const progress =
    stageIndex >= 0
      ? Math.round(
          ((stageIndex + 1) / stages.length) * 100
        )
      : 0;

  const hasChanges =
    stage !== currentStage ||
    status !== currentStatus;

  async function updateProject() {
    if (saving || !hasChanges) return;

    if (
      stage === 'completed' ||
      status === 'completed'
    ) {
      const confirmed = window.confirm(
        'Are you sure this publishing project is ready to be marked as completed?'
      );

      if (!confirmed) return;
    }

    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/project', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          stage,
          status,
        }),
      });

      const result = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error ||
            'Unable to update the publishing project.'
        );
      }

      setMessage('Project updated successfully.');
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setSaving(false);
    }
  }

  function resetChanges() {
    setStage(currentStage);
    setStatus(currentStatus);
    setMessage('');
  }

  return (
    <div className="mt-5 space-y-6">
      {/* Publishing progress */}
      <div className="rounded-xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h5 className="font-semibold">
              Publishing Progress
            </h5>

            <p className="text-sm text-slate-600 mt-1">
              {selectedStage?.label ||
                'Unknown publishing stage'}
            </p>
          </div>

          <span className="font-semibold text-lg">
            {progress}%
          </span>
        </div>

        <div
          className="w-full h-3 bg-slate-200 rounded-full overflow-hidden mt-4"
          role="progressbar"
          aria-label="Publishing workflow stage"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-[#c9a45d] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Stage {stageIndex + 1} of {stages.length}
        </p>

        <p className="text-sm text-slate-600 mt-3">
          {selectedStage?.description}
        </p>

        <p className="text-xs text-slate-500 mt-3">
          Progress represents the selected workflow
          stage, not the percentage of work completed.
        </p>
      </div>

      {/* Administrator controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label
            htmlFor={`stage-${projectId}`}
            className="block text-sm font-semibold mb-2"
          >
            Publishing Stage
          </label>

          <select
            id={`stage-${projectId}`}
            className="w-full"
            value={stage}
            onChange={(event) => {
              setStage(event.target.value);
              setMessage('');
            }}
            disabled={saving}
          >
            {stages.map((item) => (
              <option
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`status-${projectId}`}
            className="block text-sm font-semibold mb-2"
          >
            Project Status
          </label>

          <select
            id={`status-${projectId}`}
            className="w-full"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setMessage('');
            }}
            disabled={saving}
          >
            {statuses.map((item) => (
              <option
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={updateProject}
          className="btn"
          disabled={saving || !hasChanges}
        >
          {saving
            ? 'Saving Changes...'
            : 'Save Project Changes'}
        </button>

        {hasChanges && (
          <button
            type="button"
            onClick={resetChanges}
            disabled={saving}
            className="rounded-lg border px-5 py-3 text-sm font-semibold"
          >
            Cancel Changes
          </button>
        )}
      </div>

      {message && (
        <p
          role="status"
          className="text-sm font-medium"
        >
          {message}
        </p>
      )}
    </div>
  );
}
