
'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type Assignment = {
  id: string;
  assignment_role: string;
};

type Props = {
  projectId: string;
  assignments: Assignment[];
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const ALLOWED_ROLES = [
  'editor',
  'proofreader',
  'formatter',
  'cover_designer',
  'publishing_specialist',
];

function format(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StaffDeliverableUpload({
  projectId,
  assignments,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const eligibleAssignments = assignments.filter(
    (assignment) =>
      ALLOWED_ROLES.includes(assignment.assignment_role)
  );

  const [assignmentId, setAssignmentId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [pendingUpload, setPendingUpload] = useState<{
    assignmentId: string;
    storagePath: string;
    fileName: string;
    notes: string;
  } | null>(null);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setError('');
    setSuccess('');

    if (
      !eligibleAssignments.some(
        (assignment) => assignment.id === assignmentId
      )
    ) {
      setError('Select an eligible project assignment.');
      return;
    }

    if (!file || !notes.trim() || notes.trim().length > 5000) {
      setError('Select a file and enter valid submission notes.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (
      !extension ||
      !MIME_TYPES[extension] ||
      file.size === 0 ||
      file.size > MAX_FILE_SIZE ||
      file.name.length > 255
    ) {
      setError('Choose a supported file no larger than 50 MB.');
      return;
    }

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

      let submission = pendingUpload;

      if (!submission) {
        const storagePath =
          `${authData.user.id}/${projectId}/${assignmentId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await db.storage
          .from('staff-deliverables')
          .upload(storagePath, file, {
            upsert: false,
            contentType: MIME_TYPES[extension],
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        submission = {
          assignmentId,
          storagePath,
          fileName: file.name,
          notes: notes.trim(),
        };

        setPendingUpload(submission);
      }

      const { data: deliverableId, error: registerError } =
        await db.rpc('register_staff_deliverable', {
          p_assignment_id: submission.assignmentId,
          p_storage_path: submission.storagePath,
          p_file_name: submission.fileName,
          p_submission_notes: submission.notes,
        });

      if (registerError || !deliverableId) {
        // Check whether an earlier registration succeeded.
        const { data: existing } = await db
          .from('staff_deliverables')
          .select('id')
          .eq('storage_path', submission.storagePath)
          .maybeSingle();

        if (!existing) {
          throw new Error(
            'The file was uploaded but registration could not be confirmed. Retry registration without refreshing this page.'
          );
        }
      }

      setSuccess(
        'Deliverable submitted successfully. Your work is awaiting management review.'
      );

      setPendingUpload(null);
      setAssignmentId('');
      setFile(null);
      setNotes('');

      if (inputRef.current) {
        inputRef.current.value = '';
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit deliverable.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (!eligibleAssignments.length) {
    return null;
  }

  return (
    <form onSubmit={upload} className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Deliverables submitted here are confidential.
        They will be reviewed by Legavora management
        before any separate release to the author.
      </div>

      <div>
        <label
          htmlFor="deliverable-assignment"
          className="block font-semibold text-sm mb-2"
        >
          Project Assignment
        </label>

        <select
          id="deliverable-assignment"
          value={assignmentId}
          onChange={(event) =>
            setAssignmentId(event.target.value)
          }
          required
          disabled={busy || !!pendingUpload}
          className="w-full rounded-lg border bg-white p-3 text-slate-900"
        >
          <option value="">Select your assignment</option>

          {eligibleAssignments.map((assignment) => (
            <option
              key={assignment.id}
              value={assignment.id}
            >
              {format(assignment.assignment_role)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="deliverable-file"
          className="block font-semibold text-sm mb-2"
        >
          Completed Production File
        </label>

        <input
          id="deliverable-file"
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.epub,.jpg,.jpeg,.png"
          required
          disabled={busy || !!pendingUpload}
          onChange={(event) =>
            setFile(event.target.files?.[0] ?? null)
          }
          className="w-full rounded-lg border p-3"
        />

        <p className="text-xs text-slate-600 mt-2">
          PDF, DOCX, EPUB, JPG or PNG. Maximum 50 MB.
        </p>
      </div>

      <div>
        <label
          htmlFor="deliverable-notes"
          className="block font-semibold text-sm mb-2"
        >
          Submission Notes
        </label>

        <textarea
          id="deliverable-notes"
          value={notes}
          onChange={(event) =>
            setNotes(event.target.value)
          }
          required
          maxLength={5000}
          rows={5}
          disabled={busy || !!pendingUpload}
          placeholder="Describe the completed work, changes made and any important information for management."
          className="w-full rounded-lg border bg-white p-3 text-slate-900"
        />

        <p className="text-xs text-slate-600 mt-2">
          {notes.length}/5000
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="rounded-lg bg-green-50 p-4 text-sm text-green-700"
        >
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={
          busy ||
          !assignmentId ||
          !file ||
          !notes.trim()
        }
        className="rounded-lg bg-[#0d1928] px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy
          ? 'Submitting Deliverable...'
          : pendingUpload
            ? 'Retry Registration'
            : 'Submit Deliverable for Review'}
      </button>
    </form>
  );
}
