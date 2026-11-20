
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

type Review = {
  id: string;
  file_id: string;
  decision: string;
  created_at: string;
};

type EligibleFile = ProjectFile & {
  reviewId: string;
  reviewDate: string;
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
  const [eligibleFiles, setEligibleFiles] = useState<EligibleFile[]>([]);
  const [revisionNotes, setRevisionNotes] = useState('');

  const [message, setMessage] = useState('');
  const [revisionMessage, setRevisionMessage] = useState('');

  const [busy, setBusy] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [checkedRequests, setCheckedRequests] = useState(false);

  const [uploadKey, setUploadKey] = useState(0);
  const [revisionKey, setRevisionKey] = useState(0);

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

    const path =
      `${userId}/${projectId}/${fileId}.${extension}`;

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

      setMessage('Success: Your file was uploaded securely.');
      setFile(null);
      setUploadKey((value) => value + 1);

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Upload failed: ${error.message}`
          : 'Upload failed. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function getEligibleFiles() {
    const { db } = await verifyProject();

    const { data: files, error: filesError } =
      await db
        .from('project_files')
        .select(
          'id,file_name,version_number,parent_file_id,previous_file_id,file_category,created_at'
        )
        .eq('project_id', projectId)
        .eq('file_category', 'manuscript')
        .order('created_at', { ascending: false });

    if (filesError) throw filesError;

    const { data: reviews, error: reviewsError } =
      await db
        .from('manuscript_reviews')
        .select('id,file_id,decision,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (reviewsError) {
      throw new Error(
        'Unable to verify editorial revision requests. ' +
        reviewsError.message
      );
    }

    const allFiles = files || [];
    const allReviews = (reviews || []) as Review[];

    const latestReviewByFile = new Map<string, Review>();

    for (const review of allReviews) {
      if (!latestReviewByFile.has(review.file_id)) {
        latestReviewByFile.set(review.file_id, review);
      }
    }

    const available: EligibleFile[] = [];

    for (const item of allFiles) {
      const review = latestReviewByFile.get(item.id);

      if (!review || review.decision !== 'revision_requested') {
        continue;
      }

      const alreadySubmitted = allFiles.some(
        (candidate) =>
          candidate.previous_file_id === item.id &&
          new Date(candidate.created_at).getTime() >=
            new Date(review.created_at).getTime()
      );

      if (alreadySubmitted) continue;

      available.push({
        id: item.id,
        file_name: item.file_name,
        version_number: item.version_number,
        parent_file_id: item.parent_file_id,
        previous_file_id: item.previous_file_id,
        file_category: item.file_category,
        reviewId: review.id,
        reviewDate: review.created_at,
      });
    }

    return available;
  }

  async function loadProjectFiles() {
    if (loadingFiles || revisionBusy) return;

    setLoadingFiles(true);
    setRevisionMessage('');
    setCheckedRequests(false);
    setSelectedFileId('');
    setEligibleFiles([]);

    try {
      const available = await getEligibleFiles();

      setEligibleFiles(available);
      setCheckedRequests(true);

      if (available.length === 0) {
        setRevisionMessage(
          'No outstanding editorial revision requests. ' +
          'You can submit a revised manuscript when ' +
          'Legavora requests corrections.'
        );
      }
    } catch (error) {
      setRevisionMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load revision requests.'
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

      // Check the current editorial request again
      // immediately before uploading.
      const available = await getEligibleFiles();

      const previous = available.find(
        (item) => item.id === selectedFileId
      );

      if (!previous) {
        throw new Error(
          'This manuscript does not have an outstanding ' +
          'revision request, or the request has already ' +
          'been fulfilled.'
        );
      }

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

      // Keep the confirmation visible even when
      // the page refreshes.
      setRevisionMessage(
        `Success: Your revised manuscript was submitted. ` +
        `Version ${nextVersion} has been recorded.`
      );

      setRevisionFile(null);
      setSelectedFileId('');
      setRevisionNotes('');
      setRevisionKey((value) => value + 1);

      // Hide the fulfilled request from this form.
      setEligibleFiles((current) =>
        current.filter(
          (item) => item.id !== previous.id
        )
      );

      router.refresh();
    } catch (error) {
      setRevisionMessage(
        error instanceof Error
          ? `Revision failed: ${error.message}`
          : 'Unable to submit manuscript revision.'
      );
    } finally {
      setRevisionBusy(false);
    }
  }

  const revisionSucceeded =
    revisionMessage.startsWith('Success:');

  const uploadSucceeded =
    message.startsWith('Success:');

  return (
    <div className="space-y-6 mt-6">
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
          key={uploadKey}
          type="file"
          required
          accept=".pdf,.docx,.epub,.jpg,.jpeg,.png"
          onChange={(e) =>
            setFile(e.target.files?.[0] || null)
          }
        />

        <button
          type="submit"
          disabled={busy || !file}
          className="btn"
        >
          {busy ? 'Uploading...' : 'Upload File'}
        </button>

        {message && (
          <p
            role="status"
            aria-live="polite"
            className={
              uploadSucceeded
                ? 'text-sm font-semibold text-green-700'
                : 'text-sm font-semibold text-red-700'
            }
          >
            {message}
          </p>
        )}
      </form>

      <section className="panel space-y-4">
        <h3 className="font-serif text-xl">
          Submit a Revised Manuscript
        </h3>

        <p className="text-sm text-slate-600">
          Revised manuscripts can only be submitted
          after Legavora requests editorial corrections.
          Your previous manuscript and revision history
          will be preserved.
        </p>

        <button
          type="button"
          onClick={loadProjectFiles}
          disabled={loadingFiles || revisionBusy}
          className="btn"
        >
          {loadingFiles
            ? 'Checking Revision Requests...'
            : 'Check Editorial Revision Requests'}
        </button>

        {checkedRequests && eligibleFiles.length > 0 && (
          <form
            onSubmit={submitRevision}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="previous-manuscript"
                className="block text-sm font-semibold mb-2"
              >
                Manuscript Requiring Revision
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

                {eligibleFiles.map((item) => (
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
                key={revisionKey}
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
              type="submit"
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
          <p
            role="status"
            aria-live="polite"
            className={
              revisionSucceeded
                ? 'text-sm font-semibold text-green-700'
                : 'text-sm font-semibold text-slate-700'
            }
          >
            {revisionMessage}
          </p>
        )}
      </section>
    </div>
  );
}
