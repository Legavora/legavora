
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type AdminToolsProps = {
  projectId: string;
  currentStage: string;
  currentStatus: string;
};

const stages = [
  'assessment',
  'agreement',
  'editing',
  'cover_design',
  'formatting',
  'proof_approval',
  'distribution',
  'published',
  'completed',
];

const statuses = [
  'submitted',
  'in_review',
  'in_progress',
  'awaiting_author',
  'completed',
  'on_hold',
];

export default function AdminTools({
  projectId,
  currentStage,
  currentStatus,
}: AdminToolsProps) {
  const [stage, setStage] = useState(currentStage);
  const [status, setStatus] = useState(currentStatus);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setStage(currentStage);
    setStatus(currentStatus);
  }, [currentStage, currentStatus]);

  async function update() {
    setSaving(true);
    setMsg('');

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

      if (!response.ok) {
        throw new Error('Unable to update project');
      }

      setMsg('Updated successfully');
      router.refresh();
    } catch {
      setMsg('Unable to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-3 mt-4 items-center">
      <select
        aria-label="Project stage"
        className="max-w-56"
        value={stage}
        onChange={(e) => setStage(e.target.value)}
        disabled={saving}
      >
        {stages.map((item) => (
          <option key={item} value={item}>
            {item.replaceAll('_', ' ')}
          </option>
        ))}
      </select>

      <select
        aria-label="Project status"
        className="max-w-44"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        disabled={saving}
      >
        {statuses.map((item) => (
          <option key={item} value={item}>
            {item.replaceAll('_', ' ')}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={update}
        className="btn"
        disabled={saving}
      >
        {saving ? 'Updating...' : 'Update'}
      </button>

      <span className="text-sm" role="status">
        {msg}
      </span>
    </div>
  );
}
