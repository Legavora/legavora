
'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type Props = {
  projectId: string;
};

type SubmissionResult = {
  ok?: boolean;
  error?: string;
  file_id?: string;
  approval_id?: string;
  notificationSent?: boolean;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default function AdminProofUpload({
  projectId,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [proofLabel, setProofLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) return;

    setMessage('');
    setWarning('');
    setErrorMessage('');

    if (!file) {
      setErrorMessage('Please select a PDF proof.');
      return;
    }

    if (!proofLabel.trim()) {
      setErrorMessage('Please enter a proof title.');
      return;
    }

    const extension = file.name
      .split('.')
      .pop()
      ?.toLowerCase();

    if (
      extension !== 'pdf' ||
      file.size === 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      setErrorMessage(
        'Please select a valid PDF file no larger than 50 MB.'
      );
      return;
    }

    submittingRef.current = true;
    setBusy(true);

    try {
      const db = browserDb();

      const { data: authData, error: authError } =
        await db.auth.getUser();

      if (authError || !authData.user) {
        throw new Error(
          'Your session has expired. Please sign in again.'
        );
      }

      const userId = authData.user.id;

      const { data: profile, error: profileError } =
        await db
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

      if (
        profileError ||
        !profile ||
        !['admin', 'manager'].includes(profile.role)
      ) {
        throw new Error('Administrator access required.');
      }

      const fileId = crypto.randomUUID();

      const storagePath =
        `${userId}/${projectId}/${fileId}.pdf`;

      const { error: uploadError } = await db.storage
        .from('manuscripts')
        .upload(storagePath, file, {
          upsert: false,
          contentType: 'application/pdf',
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      let response: Response;

      try {
        response = await fetch('/api/admin/proofs/submit', {
          method: 'POST',
          credentials: 'same-origin',
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
      } catch {
        throw new Error(
          'The PDF was uploaded, but the approval request ' +
          'could not be confirmed. Check the project records ' +
          'before trying again.'
        );
      }

      let result: SubmissionResult;

      try {
        result = await response.json();
      } catch {
        throw new Error(
          'The server returned an unexpected response. ' +
          'Check the project records and deployment logs ' +
          'before trying again.'
        );
      }

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
          'Unable to register proof for author approval.'
        );
      }

      setMessage(
        'Proof submitted successfully. ' +
        'An approval request has been created for the author.'
      );

      if (result.notificationSent === true) {
        setMessage(
          'Proof submitted successfully. ' +
          'Author approval request created and ' +
          'email notification sent.'
        );
      } else {
        setWarning(
          'The proof and approval request were saved, ' +
          'but the author email notification could not ' +
          'be confirmed. Do not upload the proof again. ' +
          'Check Resend or contact the author directly.'
        );
      }

      setFile(null);
      setProofLabel('');

      if (inputRef.current) {
        inputRef.current.value = '';
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to submit proof for approval.'
      );
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">
          Submit Proof for Author Approval
        </h3>

        <p className="text-sm text-slate-600">
          Upload a completed PDF proof for the author to
          review. A new approval request will be created
          while earlier decisions and feedback remain
          available in the project history.
        </p>
      </div>

      <form onSubmit={upload} className="space-y-5">
        <div>
          <label
            htmlFor="admin-proof-title"
            className="block text-sm font-medium mb-2"
          >
            Proof title
          </label>

          <input
            id="admin-proof-title"
            type="text"
            value={proofLabel}
            onChange={(event) =>
              setProofLabel(event.target.value)
            }
            maxLength={255}
            placeholder="Example: Interior Layout Proof - Round 1"
            required
            disabled={busy}
            className="w-full rounded-md border bg-white p-3 text-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="admin-proof-document"
            className="block text-sm font-medium mb-2"
          >
            PDF proof document
          </label>

          <input
            id="admin-proof-document"
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            required
            disabled={busy}
            onChange={(event) =>
              setFile(event.target.files?.[0] ?? null)
            }
            className="w-full rounded-md border bg-white p-3 text-slate-900"
          />

          <p className="text-sm text-slate-500 mt-2">
            PDF only. Maximum file size: 50 MB.
          </p>
        </div>

        <button
          type="submit"
          className="btn"
          disabled={
            busy ||
            !file ||
            !proofLabel.trim()
          }
        >
          {busy
            ? 'Submitting Proof...'
            : 'Submit Proof for Approval'}
        </button>
      </form>

      {message && (
        <p
          role="status"
          className="text-sm font-medium text-green-700"
        >
          {message}
        </p>
      )}

      {warning && (
        <p
          role="status"
          className="text-sm font-medium text-amber-700"
        >
          {warning}
        </p>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="text-sm font-medium text-red-700"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
