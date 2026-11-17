
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'epub', 'jpg', 'jpeg', 'png'];

export default function ProjectActions({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || busy) return;

    setMessage('');

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (
      !extension ||
      !ALLOWED_EXTENSIONS.includes(extension) ||
      file.size === 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      setMessage('Please select a supported file smaller than 20 MB.');
      return;
    }

    setBusy(true);

    try {
      const db = browserDb();

      const { data: authData, error: authError } = await db.auth.getUser();

      if (authError || !authData.user) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const userId = authData.user.id;

      // Confirm the author owns this project.
      const { data: project, error: projectError } = await db
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('author_id', userId)
        .single();

      if (projectError || !project) {
        throw new Error('You do not have access to this project.');
      }

      const fileId = crypto.randomUUID();
      const path = `${userId}/${projectId}/${fileId}.${extension}`;

      // Upload directly to private Supabase Storage.
      const { error: storageError } = await db.storage
        .from('manuscripts')
        .upload(path, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream'
        });

      if (storageError) throw storageError;

      // Record the uploaded file in the project database.
      const { error: recordError } = await db
        .from('project_files')
        .insert({
          project_id: projectId,
          uploaded_by: userId,
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size
        });

      if (recordError) {
        await db.storage.from('manuscripts').remove([path]);
        throw recordError;
      }

      setMessage('File uploaded securely.');
      setFile(null);
      router.refresh();

    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Upload failed. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="panel mt-6 space-y-3">
      <h3 className="font-serif text-xl">
        Upload manuscript or production file
      </h3>

      <p className="text-sm text-slate-600">
        Allowed: PDF, DOCX, EPUB, JPG and PNG. Maximum 20 MB.
      </p>

      <input
        type="file"
        required
        accept=".pdf,.docx,.epub,.jpg,.jpeg,.png"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <button disabled={busy || !file} className="btn">
        {busy ? 'Uploading...' : 'Upload File'}
      </button>

      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
