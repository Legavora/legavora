
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  'pdf',
  'docx',
  'epub',
  'jpg',
  'jpeg',
  'png',
];

type ProjectFile = {
  id: string;
  file_name: string;
  version_number: number;
  parent_file_id: string | null;
  previous_file_id: string | null;
  file_category: string;
};

export default function ProjectActions({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [message, setMessage] = useState('');
  const [revisionMessage, setRevisionMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  function validateFile(selected: File) {
    const extension = selected.name
      .split('.')
      .pop()
      ?.toLowerCase();

    if (
      !extension ||
      !ALLOWED_EXTENSIONS.includes(extension) ||
      selected.size === 0 ||
      selected.size > MAX_FILE_SIZE
    ) {
      throw new Error(
        'Please select a supported file no larger than 20 MB.'
      );
    }

    return extension;
  }

  async function verifyProject() {
    const db = browserDb();

    const { data: authData, error: authError } =
      await db.auth.getUser();

    if (authError || !authData.user) {
      throw new Error(
        'Your session has expired. Please sign in again.'
      );
    }

    const userId = authData.user.id;

    const { data: project, error: projectError } =
      await db
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('author_id', userId)
        .single();

    if (projectError || !project) {
      throw new Error(
        'You do not have access to this project.'
      );
    }

    return { db, userId };
  }

  async function uploadToStorage(
    selected: File,
    userId: string,
    db: ReturnType<typeof browserDb>
  ) {
    const extension = validateFile(selected);
    const fileId = crypto.randomUUID();
    const path = `${userId}/${projectId}/${fileId}.${extension}`;

    const { error } = await db.storage
      .from('manuscripts')
      .upload(path, selected, {
        upsert: false,
        contentType:
          selected.type || 'application/octet-stream',
      });

    if (error) throw error;

    return path;
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!file || busy) return;

    setMessage('');
    setBusy(true);

    try {
      validateFile(file);

      const { db, userId } = await verifyProject();

      const path = await uploadToStorage(
        file,
        userId,
        db
      );

      const { error: recordError } = await db
        .from('project_files')
        .insert({
          project_id: projectId,
          uploaded_by: userId,
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size,
          file_category: 'manuscript',
          version_number: 1,
        });

      if (recordError) {
        await db.storage
          .from('manuscripts')
          .remove([path]);

        throw recordError;
      }

      setMessage('File uploaded securely.');
      setFile(null);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Upload failed. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadProjectFiles() {
    setLoadingFiles(true);
    setRevisionMessage('');

    try {
      const { db } = await verifyProject();

      const { data, error } = await db
        .from('project_files')
        .select(
          'id,file_name,version_number,parent_file_id,previous_file_id,file_category'
        )
        .eq('project_id', projectId)
        .eq('file_category', 'manuscript')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProjectFiles(data || []);
    } catch (error) {
      setRevisionMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load manuscripts.'
      );
    } finally {
      setLoadingFiles(false);
    }
  }

  async function submitRevision(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      !revisionFile ||
      !selectedFileId ||
      revisionBusy
    ) {
      return;
    }

    setRevisionMessage('');
    setRevisionBusy(true);

    try {
      validateFile(revisionFile);

      const { db, userId } = await verifyProject();

      // Re-read the original record rather than trusting
      // the browser's selected file information.
      const { data: previous, error: previousError } =
        await db
          .from('project_files')
          .select(
            'id,project_id,version_number,parent_file_id,file_category'
          )
          .eq('id', selectedFileId)
          .eq('project_id', projectId)
          .eq('file_category', 'manuscript')
          .single();

      if (previousError || !previous) {
        throw new Error(
          'The selected manuscript could not be verified.'
        );
      }

      // Preserve the original version as the root
      // of this manuscript's revision history.
      const rootFileId =
        previous.parent_file_id || previous.id;

      const nextVersion =
        previous.version_number + 1;

      const path = await uploadToStorage(
        revisionFile,
        userId,
        db
      );

      const { error: recordError } = await db
        .from('project_files')
        .insert({
          project_id: projectId,
          uploaded_by: userId,
          file_name: revisionFile.name,
          storage_path: path,
          size_bytes: revisionFile.size,
          file_category: 'manuscript',
          version_number: nextVersion,
          parent_file_id: rootFileId,
          previous_file_id: previous.id,
          revision_notes:
            revisionNotes.trim() || null,
          revised_at: new Date().toISOString(),
        });

      if (recordError) {
        await db.storage
          .from('manuscripts')
          .remove([path]);

        throw recordError;
      }

      setRevisionMessage(
        `Revised manuscript submitted successfully. Version ${nextVersion} has been recorded.`
      );

      setRevisionFile(null);
      setSelectedFileId('');
      setRevisionNotes('');

      await loadProjectFiles();
      router.refresh();
    } catch (error) {
      setRevisionMessage(
        error instanceof Error
          ? error.message
          : 'Unable to submit manuscript revision.'
      );
    } finally {
      setRevisionBusy(false);
    }
  }

  return (
    <div className="space-y-6 mt-6">
      {/* EXISTING FILE UPLOAD */}
      <form
        onSubmit={upload}
        className="panel space-y-3"
      >
        <h3 className="font-serif text-xl">
          Upload Manuscript or Production File
        </h3>

        <p className="text-sm text-slate-600">
          Upload a new manuscript or production document.
          Allowed: PDF, DOCX, EPUB, JPG and PNG.
          Maximum 20 MB.
        </p>

        <input
          type="file"
          required
          accept=".pdf,.docx,.epub,.jpg,.jpeg,.png"
          onChange={(e) =>
            setFile(e.target.files?.[0] || null)
          }
        />

        <button
          disabled={busy || !file}
          className="btn"
        >
          {busy ? 'Uploading...' : 'Upload File'}
        </button>

        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>

      {/* MANUSCRIPT REVISION SUBMISSION */}
      <section className="panel space-y-4">
        <h3 className="font-serif text-xl">
          Submit a Revised Manuscript
        </h3>

        <p className="text-sm text-slate-600">
          If Legavora has requested editorial
          corrections, upload your revised manuscript
          here. Your previous manuscript and its
          editorial history will be preserved.
        </p>

        <button
          type="button"
          onClick={loadProjectFiles}
          disabled={loadingFiles || revisionBusy}
          className="btn"
        >
          {loadingFiles
            ? 'Loading Manuscripts...'
            : 'Select Manuscript for Revision'}
        </button>

        {projectFiles.length > 0 && (
          <form
            onSubmit={submitRevision}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="previous-manuscript"
                className="block text-sm font-semibold mb-2"
              >
                Manuscript to Revise
              </label>

              <select
                id="previous-manuscript"
                required
                value={selectedFileId}
                onChange={(e) =>
                  setSelectedFileId(e.target.value)
                }
                className="w-full border rounded-lg p-3"
              >
                <option value="">
                  Choose a manuscript
                </option>

                {projectFiles.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.file_name} — Version{' '}
                    {item.version_number}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="revised-file"
                className="block text-sm font-semibold mb-2"
              >
                Revised Manuscript
              </label>

              <input
                id="revised-file"
                type="file"
                required
                accept=".pdf,.docx,.epub,.jpg,.jpeg,.png"
                onChange={(e) =>
                  setRevisionFile(
                    e.target.files?.[0] || null
                  )
                }
              />
            </div>

            <div>
              <label
                htmlFor="revision-notes"
                className="block text-sm font-semibold mb-2"
              >
                Revision Notes
              </label>

              <textarea
                id="revision-notes"
                value={revisionNotes}
                onChange={(e) =>
                  setRevisionNotes(e.target.value)
                }
                rows={4}
                maxLength={5000}
                placeholder="Describe the corrections made in this version."
                className="w-full border rounded-lg p-3"
              />
            </div>

            <button
              disabled={
                revisionBusy ||
                !revisionFile ||
                !selectedFileId
              }
              className="btn"
            >
              {revisionBusy
                ? 'Submitting Revision...'
                : 'Submit Revised Manuscript'}
            </button>
          </form>
        )}

        {revisionMessage && (
          <p role="status" className="text-sm">
            {revisionMessage}
          </p>
        )}
      </section>
    </div>
  );
}
