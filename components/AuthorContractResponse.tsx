'use client';

import { useRef, useState } from 'react';
import { browserDb } from '@/lib/supabase-browser';

type Props = {
  contractVersionId: string;
  contractTitle: string;
  versionNumber: number;
  documentSha256: string;
  status: string;
};

export default function AuthorContractResponse({
  contractVersionId,
  contractTitle,
  versionNumber,
  documentSha256,
  status,
}: Props) {
  const [decision, setDecision] = useState<
    'accepted' | 'declined' | ''
  >('');
  const [fullName, setFullName] = useState('');
  const [responseNotes, setResponseNotes] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [electronicConsent, setElectronicConsent] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submitting = useRef(false);

  async function submitResponse(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting.current ||
      success ||
      status !== 'awaiting_acceptance'
    ) {
      return;
    }

    setError('');

    const name = fullName.trim();
    const notes = responseNotes.trim();

    if (!decision) {
      setError('Please select an agreement decision.');
      return;
    }

    if (name.length < 1 || name.length > 250) {
      setError('Please enter your full legal name.');
      return;
    }

    if (!reviewed) {
      setError(
        'Please confirm that you have reviewed the agreement.'
      );
      return;
    }

    if (decision === 'accepted' && !electronicConsent) {
      setError(
        'Electronic consent is required to accept this agreement.'
      );
      return;
    }

    if (notes.length > 2000) {
      setError('Response notes cannot exceed 2000 characters.');
      return;
    }

    if (!/^[0-9a-f]{64}$/.test(documentSha256)) {
      setError(
        'Agreement document verification failed. Refresh this page.'
      );
      return;
    }

    const confirmation =
      decision === 'accepted'
        ? 'You are about to electronically accept this agreement. Do you wish to continue?'
        : 'You are about to decline this agreement. Do you wish to continue?';

    if (!window.confirm(confirmation)) {
      return;
    }

    submitting.current = true;
    setLoading(true);

    try {
      const db = browserDb();

      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser();

      if (authError || !user) {
        throw new Error(
          'Your session has expired. Please sign in again.'
        );
      }

      const { error: responseError } = await db.rpc(
        'respond_to_contract',
        {
          p_contract_version_id: contractVersionId,
          p_decision: decision,
          p_full_name: name,
          p_document_sha256: documentSha256,
          p_electronic_consent:
            decision === 'accepted' && electronicConsent,
          p_response_notes: notes || null,
        }
      );

      if (responseError) {
        throw new Error(responseError.message);
      }

      setSuccess(true);
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit your agreement response.'
      );

      submitting.current = false;
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-xl border border-green-200 bg-green-50 p-5"
      >
        <h4 className="font-semibold text-green-800">
          Agreement Response Recorded
        </h4>

        <p className="mt-2 text-sm text-green-700">
          Your response has been successfully recorded.
        </p>
      </div>
    );
  }

  if (status !== 'awaiting_acceptance') {
    return null;
  }

  return (
    <form
      onSubmit={submitResponse}
      className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-6"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          Legavora Agreement Centre
        </p>

        <h3 className="mt-2 text-xl font-semibold text-slate-900">
          Respond to Agreement
        </h3>

        <p className="mt-2 text-sm text-slate-600">
          Review the complete agreement before submitting
          your decision.
        </p>
      </div>

      <div className="space-y-2 rounded-lg bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {contractTitle}
        </p>

        <p className="text-sm text-slate-600">
          Agreement Version: {versionNumber}
        </p>

        <p className="text-xs font-semibold text-slate-600">
          SHA-256 Document Fingerprint
        </p>

        <p className="break-all font-mono text-xs text-slate-500">
          {documentSha256}
        </p>
      </div>

      <fieldset disabled={loading} className="space-y-3">
        <legend className="mb-3 text-sm font-semibold text-slate-900">
          Your Decision
        </legend>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <input
            type="radio"
            name={`decision-${contractVersionId}`}
            checked={decision === 'accepted'}
            onChange={() => {
              setDecision('accepted');
              setElectronicConsent(false);
              setError('');
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-green-700"
          />

          <span>
            <span className="block font-semibold text-green-900">
              Accept Agreement
            </span>

            <span className="mt-1 block text-sm text-green-800">
              I agree to the terms of this agreement and
              wish to record my electronic acceptance.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <input
            type="radio"
            name={`decision-${contractVersionId}`}
            checked={decision === 'declined'}
            onChange={() => {
              setDecision('declined');
              setElectronicConsent(false);
              setError('');
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
          />

          <span>
            <span className="block font-semibold text-slate-900">
              Decline Agreement
            </span>

            <span className="mt-1 block text-sm text-slate-600">
              I do not accept the current agreement terms.
            </span>
          </span>
        </label>
      </fieldset>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-900">
          Full Legal Name
        </span>

        <input
          type="text"
          value={fullName}
          onChange={(event) =>
            setFullName(event.target.value)
          }
          placeholder="Enter your full legal name"
          maxLength={250}
          autoComplete="name"
          required
          disabled={loading}
          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
        />

        <span className="block text-xs text-slate-500">
          Your name will be recorded with your agreement response.
        </span>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-900">
          Response Notes (Optional)
        </span>

        <textarea
          value={responseNotes}
          onChange={(event) =>
            setResponseNotes(event.target.value)
          }
          placeholder="Enter any comments or concerns regarding this agreement."
          rows={4}
          maxLength={2000}
          disabled={loading}
          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
        />

        <span className="block text-right text-xs text-slate-500">
          {responseNotes.length}/2000
        </span>
      </label>

      <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h4 className="font-semibold text-amber-900">
          Agreement Review and Consent
        </h4>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => {
              setReviewed(event.target.checked);

              if (!event.target.checked) {
                setElectronicConsent(false);
              }
            }}
            disabled={loading}
            required
            className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
          />

          <span className="text-sm text-slate-800">
            I confirm that I have reviewed this version of
            the agreement and understand the decision I
            am submitting.
          </span>
        </label>

        {decision === 'accepted' && (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={electronicConsent}
              onChange={(event) =>
                setElectronicConsent(event.target.checked)
              }
              disabled={loading || !reviewed}
              required
              className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
            />

            <span className="text-sm text-slate-800">
              I voluntarily consent to electronic acceptance
              and intend my typed legal name and recorded
              consent to serve as my electronic signature
              for this specific agreement version.
            </span>
          </label>
        )}

        <p className="text-xs leading-relaxed text-amber-900">
          Your response, name, document fingerprint and
          submission timestamp will be recorded in
          Legavora's agreement records.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={
          loading ||
          !decision ||
          !fullName.trim() ||
          !reviewed ||
          (decision === 'accepted' && !electronicConsent)
        }
        className={`w-full rounded-lg px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
          decision === 'declined'
            ? 'bg-slate-700 hover:bg-slate-800'
            : 'bg-slate-900 hover:bg-slate-800'
        }`}
      >
        {loading
          ? 'Recording Your Response...'
          : decision === 'accepted'
            ? 'Electronically Accept Agreement'
            : decision === 'declined'
              ? 'Submit Agreement Decline'
              : 'Select Your Decision'}
      </button>

      <p className="text-center text-xs text-slate-500">
        Legavora Global Services Ltd · Confidential Agreement
      </p>
    </form>
  );
}
