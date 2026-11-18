
'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  projectId: string;
  existingFiles: {
    id: string;
    file_name: string;
    version_number: number | null;
  }[];
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED = ['pdf', 'docx', 'epub', 'jpg', 'jpeg', 'png'];

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
    if (!file || busy) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (
      !extension ||
      !ALLOWED.includes(extension) ||
      file.size === 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      setMessage('Choose a supported file up to 50 MB.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('project_id', projectId);
      form.append('previous_file_id', previousFileId);
      form.append('revision_notes', notes);

      const response = await fetch('/api/admin/files/revise', {
        method: 'POST',
        body: form,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed.');
      }

      setMessage('Revised file uploaded successfully.');
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
        <label className="block text-sm mb-2">
          File being revised
        </label>

        <select
          value={previousFileId}
          onChange={(event) =>
            setPreviousFileId(event.target.value)
          }
          className="w-full"
          required
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
        <label className="block text-sm mb-2">
          Revised document
        </label>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.epub,.jpg,.jpeg,.png"
          required
          onChange={(event) =>
            setFile(event.target.files?.[0] ?? null)
          }
        />

        <p className="text-sm text-slate-500 mt-2">
          PDF, DOCX, EPUB, JPG or PNG. Maximum 50 MB.
        </p>
      </div>

      <div>
        <label className="block text-sm mb-2">
          Revision notes
        </label>

        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Describe the corrections or changes made."
          rows={4}
          className="w-full"
          required
        />
      </div>

      <button
        type="submit"
        className="btn"
        disabled={busy || !file || !previousFileId || !notes.trim()}
      >
        {busy ? 'Uploading revision...' : 'Upload Revised Version'}
      </button>

      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
