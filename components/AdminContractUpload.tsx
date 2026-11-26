
'use client';

import { useRef, useState } from 'react';
import { browserDb } from '@/lib/supabase-browser';

type Props = {
  projectId: string;
};

const CONTRACT_TYPES = [
  {
    value: 'publishing_agreement',
    label: 'Publishing Agreement',
  },
  {
    value: 'service_agreement',
    label: 'Service Agreement',
  },
  {
    value: 'marketing_agreement',
    label: 'Marketing Agreement',
  },
  {
    value: 'production_agreement',
    label: 'Production Agreement',
  },
  {
    value: 'confidentiality_agreement',
    label: 'Confidentiality Agreement',
  },
  {
    value: 'amendment',
    label: 'Contract Amendment',
  },
  {
    value: 'other',
    label: 'Other Agreement',
  },
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type UploadedDocument = {
  storagePath: string;
  fileName: string;
  sha256: string;
  userId: string;
};

async function generateSHA256(file: File) {
  const buffer = await file.arrayBuffer();

  const digest = await crypto.subtle.digest(
    'SHA-256',
    buffer
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) =>
      byte.toString(16).padStart(2, '0')
    )
    .join('');
}

export default function AdminContractUpload({
  projectId,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const [title, setTitle] = useState('');
  const [contractType, setContractType] =
    useState('publishing_agreement');

  const [file, setFile] = useState<File | null>(null);

  const [uploadedDocument, setUploadedDocument] =
    useState<UploadedDocument | null>(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function uploadContract(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy.current || success) return;

    setError('');
    setSuccess('');

    const cleanTitle = title.trim();

    if (
      cleanTitle.length < 1 ||
      cleanTitle.length > 250
    ) {
      setError('Enter a valid contract title.');
      return;
    }

    if (
      !CONTRACT_TYPES.some(
        (type) => type.value === contractType
      )
    ) {
      setError('Select a valid agreement type.');
      return;
    }

    if (!file && !uploadedDocument) {
      setError('Select a contract PDF.');
      return;
    }

    if (file && !uploadedDocument) {
      if (
        file.type !== 'application/pdf' ||
        !file.name.toLowerCase().endsWith('.pdf')
      ) {
        setError('Only PDF documents are accepted.');
        return;
      }

      if (
        file.size < 1 ||
        file.size > MAX_FILE_SIZE
      ) {
        setError(
          'The PDF must be smaller than or equal to 50 MB.'
        );
        return;
      }

      if (file.name.trim().length > 255) {
        setError('The PDF filename is too long.');
        return;
      }
    }

    busy.current = true;
    setLoading(true);

    try {
      const db = browserDb();

      setProgress('Verifying management authorization...');

      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser();

      if (authError || !user) {
        throw new Error(
          'Please sign in again to continue.'
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (
        profileError ||
        !profile ||
        !['admin', 'manager'].includes(profile.role)
      ) {
        throw new Error(
          'Management authorization required.'
        );
      }

      let document = uploadedDocument;

      if (document && document.userId !== user.id) {
        throw new Error(
          'The uploaded document belongs to another session.'
        );
      }

      if (!document) {
        if (!file) {
          throw new Error('Select a contract PDF.');
        }

        setProgress('Checking PDF document...');

        const header = await file
          .slice(0, 5)
          .text();

        if (header !== '%PDF-') {
          throw new Error(
            'The selected file does not have a valid PDF header.'
          );
        }

        setProgress(
          'Generating secure document fingerprint...'
        );

        const sha256 = await generateSHA256(file);

        const storagePath =
          `${user.id}/${projectId}/${crypto.randomUUID()}.pdf`;

        setProgress(
          'Uploading agreement to private storage...'
        );

        const { error: uploadError } = await db.storage
          .from('contracts')
          .upload(storagePath, file, {
            contentType: 'application/pdf',
            cacheControl: '0',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        document = {
          storagePath,
          fileName: file.name.trim(),
          sha256,
          userId: user.id,
        };

        setUploadedDocument(document);
      }

      setProgress('Registering contract as Version 1...');

      const {
        data: contractId,
        error: registrationError,
      } = await db.rpc('register_contract', {
        p_project_id: projectId,
        p_title: cleanTitle,
        p_contract_type: contractType,
        p_file_name: document.fileName,
        p_storage_path: document.storagePath,
        p_document_sha256: document.sha256,
      });

      if (registrationError) {
        throw new Error(registrationError.message);
      }

      if (!contractId) {
        throw new Error(
          'Contract registration could not be confirmed.'
        );
      }

      setSuccess(
        'Contract uploaded and registered successfully as Version 1. The agreement is saved as a draft.'
      );

      setProgress('');
      setUploadedDocument(null);
      setTitle('');
      setFile(null);
      setContractType('publishing_agreement');

      if (fileInput.current) {
        fileInput.current.value = '';
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to register contract.'
      );

      setProgress('');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-6 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Legavora Contract Management
        </p>

        <h3 className="font-serif text-2xl text-slate-900">
          Upload New Agreement
        </h3>

        <p className="text-sm text-slate-600">
          Create a confidential publishing or service
          agreement for this project.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-900">
          Secure Contract Registration
        </p>

        <p className="mt-2 text-sm text-blue-800">
          Agreements are stored privately and registered
          with a SHA-256 document fingerprint. New
          agreements remain in draft status until
          officially issued to the author.
        </p>
      </div>

      <form
        onSubmit={uploadContract}
        className="space-y-5"
      >
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-900">
            Contract Title
          </span>

          <input
            type="text"
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
            maxLength={250}
            placeholder="Enter the agreement title"
            required
            disabled={loading || !!success}
            className="w-full rounded-lg border p-3 text-slate-900"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-900">
            Agreement Type
          </span>

          <select
            value={contractType}
            onChange={(event) =>
              setContractType(event.target.value)
            }
            disabled={loading || !!success}
            className="w-full rounded-lg border bg-white p-3 text-slate-900"
          >
            {CONTRACT_TYPES.map((type) => (
              <option
                key={type.value}
                value={type.value}
              >
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-900">
            Contract Document
          </span>

          <input
            ref={fileInput}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              setFile(
                event.target.files?.[0] || null
              );
              setError('');
            }}
            disabled={
              loading ||
              !!uploadedDocument ||
              !!success
            }
            required={
              !uploadedDocument && !success
            }
            className="w-full rounded-lg border p-3 text-sm"
          />

          <p className="text-xs text-slate-500">
            Accepted format: PDF. Maximum size: 50 MB.
          </p>
        </label>

        {file && !uploadedDocument && (
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold break-all">
              {file.name}
            </p>

            <p className="mt-1 text-xs text-slate-600">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}

        {uploadedDocument && !success && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Document uploaded
            </p>

            <p className="mt-1 text-sm text-amber-800">
              If registration failed, retry registration
              without uploading another copy. Do not
              leave this page until registration is
              confirmed or management has reviewed the
              error.
            </p>
          </div>
        )}

        <div className="rounded-lg border bg-slate-50 p-4">
          <p className="text-sm font-semibold">
            Initial Agreement Status
          </p>

          <p className="mt-2 text-sm text-slate-600">
            Version: 1
          </p>

          <p className="mt-1 text-sm text-slate-600">
            Status: Draft
          </p>

          <p className="mt-1 text-sm text-slate-600">
            Author visibility: Private until issued
          </p>
        </div>

        {progress && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800"
          >
            {progress}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <div
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 p-4"
          >
            <p className="text-sm font-semibold text-green-800">
              Contract Registered Successfully
            </p>

            <p className="mt-2 text-sm text-green-700">
              {success}
            </p>
          </div>
        )}

        {!success ? (
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? 'Processing Agreement...'
              : uploadedDocument
                ? 'Retry Contract Registration'
                : 'Upload and Register Agreement'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white"
          >
            Refresh Contract Workspace
          </button>
        )}
      </form>
    </div>
  );
}
