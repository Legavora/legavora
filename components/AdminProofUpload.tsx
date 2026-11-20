
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Props = {
  projectId: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default function AdminProofUpload({
  projectId,
}: Props) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [proofLabel, setProofLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (uploading) return;

    setMessage('');
    setError('');

    if (!file) {
      setError('Please select a PDF proof.');
      return;
    }

    if (!proofLabel.trim()) {
      setError('Please enter a proof title.');
      return;
    }

    if (
      file.size === 0 ||
      file.size > MAX_FILE_SIZE ||
      file.name.split('.').pop()?.toLowerCase() !== 'pdf'
    ) {
      setError('Select a valid PDF file of 50 MB or less.');
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('Please sign in as an administrator.');
      }

      const storagePath =
        `${user.id}/${projectId}/${crypto.randomUUID()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('manuscripts')
        .upload(storagePath, file, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const response = await fetch('/api/admin/proofs/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          storage_path: storagePath,
          file_name: file.name,
          size_bytes: file.size,
          proof_label: proofLabel.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || 'Unable to submit proof for review.'
        );
      }

      setMessage(
        'Proof submitted successfully. The author can now review it.'
      );

      setFile(null);
      setProofLabel('');

      const fileInput = document.getElementById(
        'admin-proof-file'
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = '';
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">
          Submit Proof for Author Approval
        </h3>

        <p className="text-sm text-slate-600">
          Upload a completed PDF proof and create a new
          approval request for the author. Existing proof
          decisions and feedback will remain in the
          project history.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium">
            Proof title
          </span>

          <input
            type="text"
            value={proofLabel}
            onChange={(event) =>
              setProofLabel(event.target.value)
            }
            maxLength={255}
            placeholder="Example: Interior Layout Proof — Round 1"
            required
            disabled={uploading}
            className="w-full rounded-md border bg-white p-3 text-slate-900"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">
            PDF proof document
          </span>

          <input
            id="admin-proof-file"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) =>
              setFile(event.target.files?.[0] || null)
            }
            required
            disabled={uploading}
            className="w-full rounded-md border bg-white p-3 text-slate-900"
          />

          <span className="block text-xs text-slate-500">
            PDF only. Maximum file size: 50 MB.
          </span>
        </label>

        <button
          type="submit"
          disabled={
            uploading ||
            !file ||
            !proofLabel.trim()
          }
          className="rounded-md bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading
            ? 'Submitting Proof...'
            : 'Submit Proof for Approval'}
        </button>
      </form>

      {message && (
        <p role="status" className="text-sm font-medium text-green-700">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
