
'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type Props = {
  projectId: string;
  existingFiles: {
    id: string;
    file_name: string;
    version_number: number | null;
  }[];
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED = [
  'pdf',
  'docx',
  'epub',
  'jpg',
  'jpeg',
  'png',
];

export default function AdminRevisionUpload({
  projectId,
  existingFiles,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previousFileId, setPreviousFileId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || !file || !previousFileId || !notes.trim()) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (
      !extension ||
      !ALLOWED.includes(extension) ||
      file.size === 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      setMessage('Choose a supported file no larger than 50 MB.');
      return;
    }

    setBusy(true);
    setMessage('');

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
        `${userId}/${projectId}/${fileId}.${extension}`;

      // Upload the document directly to private Supabase Storage.
      const { error: uploadError } = await db.storage
        .from('manuscripts')
        .upload(storagePath, file, {
          upsert: false,
          contentType:
            file.type || 'application/octet-stream',
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Register the revision using the server API.
      let response: Response;

      try {
        response = await fetch('/api/admin/files/revise', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            project_id: projectId,
            previous_file_id: previousFileId,
            storage_path: storagePath,
            file_name: file.name,
            size_bytes: file.size,
            revision_notes: notes.trim(),
          }),
        });
      } catch {
        throw new Error(
          'File uploaded, but revision registration failed. ' +
          'Contact an administrator before retrying.'
        );
      }

      const responseText = await response.text();

      let result: {
        ok?: boolean;
        error?: string;
        version_number?: number;
      } = {};

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          'The server returned an unexpected response. ' +
          'Please check the deployment logs.'
        );
      }

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || 'Unable to register revised file.'
        );
      }

      setMessage(
        `Revised file uploaded successfully. ` +
        `Version ${result.version_number ?? 'new'} created.`
      );

      setFile(null);
      setPreviousFileId('');
      setNotes('');

      if (inputRef.current) {
        inputRef.current.value = '';
      }

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to upload revised file.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="mt-6 space-y-4">
      <h5 className="font-semibold text-lg">
        Upload Revised Version
      </h5>

      <div>
        <label
          htmlFor="revision-original"
          className="block text-sm mb-2"
        >
          File being revised
        </label>

        <select
          id="revision-original"
          value={previousFileId}
          onChange={(event) =>
            setPreviousFileId(event.target.value)
          }
          className="w-full"
          required
          disabled={busy}
        >
          <option value="">Select an existing file</option>

          {existingFiles.map((existing) => (
            <option key={existing.id} value={existing.id}>
              {existing.file_name} — V
              {existing.version_number ?? 1}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="revision-document"
          className="block text-sm mb-2"
        >
          Revised document
        </label>

        <input
          id="revision-document"
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.epub,.jpg,.jpeg,.png"
          required
          disabled={busy}
          onChange={(event) =>
            setFile(event.target.files?.[0] ?? null)
          }
        />

        <p className="text-sm text-slate-500 mt-2">
          PDF, DOCX, EPUB, JPG or PNG. Maximum 50 MB.
        </p>
      </div>

      <div>
        <label
          htmlFor="revision-notes"
          className="block text-sm mb-2"
        >
          Revision notes
        </label>

        <textarea
          id="revision-notes"
          value={notes}
          onChange={(event) =>
            setNotes(event.target.value)
          }
          placeholder="Describe the corrections or changes made."
          rows={4}
          className="w-full"
          required
          disabled={busy}
        />
      </div>

      <button
        type="submit"
        className="btn"
        disabled={
          busy ||
          !file ||
          !previousFileId ||
          !notes.trim()
        }
      >
        {busy
          ? 'Uploading revision...'
          : 'Upload Revised Version'}
      </button>

      {message && (
        <p role="status" className="text-sm mt-3">
          {message}
        </p>
      )}
    </form>
  );
}
