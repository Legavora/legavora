
'use client';

import { useState } from 'react';
import { browserDb } from '@/lib/supabase-browser';

type Props = {
  contractVersionId: string;
  status: string;
};

export default function AdminContractIssue({
  contractVersionId,
  status,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function issueAgreement() {
    if (loading || success || status !== 'draft') {
      return;
    }

    setError('');

    if (!confirmed) {
      setError(
        'Please confirm that you have reviewed and authorized this agreement.'
      );
      return;
    }

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

      const { data: profile, error: profileError } =
        await db
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
          'Management authorization is required.'
        );
      }

      const { error: issueError } = await db.rpc(
        'issue_contract',
        {
          p_contract_version_id: contractVersionId,
        }
      );

      if (issueError) {
        throw new Error(issueError.message);
      }

      setSuccess(true);

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to issue the agreement.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-xl border border-green-200 bg-green-50 p-4"
      >
        <p className="font-semibold text-green-800">
          Agreement Issued Successfully
        </p>

        <p className="mt-1 text-sm text-green-700">
          The agreement is now available to the
          assigned author for review.
        </p>
      </div>
    );
  }

  if (status !== 'draft') {
    return null;
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-amber-900">
          Official Agreement Issuance
        </h4>

        <p className="text-sm leading-relaxed text-amber-800">
          Issuing this agreement makes the document
          available to the assigned author for review
          and acceptance. Verify the document and
          recipient before proceeding.
        </p>
      </div>

      <label className="flex cursor-pointer items-start justify-start gap-3">

        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            setConfirmed(event.target.checked);
            setError('');
          }}
          disabled={loading}
          className="mt-1 h-4 w-4 shrink-0 accent-slate-900"
          style={{
            width: '16px',
            minWidth: '16px',
            height: '16px',
          }}
        />

        <span className="text-sm leading-relaxed text-slate-800">
          I have reviewed this agreement and authorize
          its official issuance to the assigned author.
        </span>

      </label>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm font-semibold text-red-800">
            Agreement Issuance Failed
          </p>

          <p className="mt-1 text-sm text-red-700">
            {error}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={issueAgreement}
        disabled={!confirmed || loading || success}
        className="inline-flex w-auto items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? 'Issuing Agreement...'
          : 'Issue Agreement to Author'}
      </button>

      <p className="text-xs leading-relaxed text-slate-600">
        Successful issuance is recorded in the
        agreement history and system audit log.
      </p>

    </div>
  );
}
