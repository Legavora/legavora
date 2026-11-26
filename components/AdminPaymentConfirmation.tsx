
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  status: string;
};

export default function AdminPaymentConfirmation({
  invoiceId,
  invoiceNumber,
  amountCents,
  status,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function confirmPayment(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading || success || status !== 'pending') return;

    setError('');

    if (!verified) {
      setError('Confirm that the full payment has been received.');
      return;
    }

    if (
      reference.trim().length < 3 ||
      reference.trim().length > 200
    ) {
      setError('Enter a valid payment reference.');
      return;
    }

    if (
      !notes.trim() ||
      notes.trim().length > 2000
    ) {
      setError('Enter payment verification notes.');
      return;
    }

    setLoading(true);

    try {
      const db = browserDb();

      const { error: paymentError } = await db.rpc(
        'confirm_manual_invoice_payment',
        {
          p_invoice_id: invoiceId,
          p_payment_method: method,
          p_payment_reference: reference.trim(),
          p_payment_notes: notes.trim(),
        }
      );

      if (paymentError) {
        throw new Error(paymentError.message);
      }

      setSuccess(true);
      setOpen(false);
      router.refresh();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to confirm payment.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <p
        role="status"
        className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
      >
        Payment confirmed successfully.
      </p>
    );
  }

  if (status !== 'pending') return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border px-4 py-2 text-sm font-semibold"
      >
        Confirm Manual Payment
      </button>
    );
  }

  return (
    <form
      onSubmit={confirmPayment}
      className="rounded-lg border p-5 space-y-5"
    >
      <div className="space-y-2">
        <h3 className="font-semibold">
          Confirm Manual Payment
        </h3>

        <p className="text-sm text-slate-600">
          Invoice: {invoiceNumber}
        </p>

        <p className="text-lg font-semibold">
          USD {(amountCents / 100).toFixed(2)}
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          Only confirm this invoice after independently
          verifying that the full payment has been received.
          This action records payment and does not transfer money.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-semibold">
          Payment Method
        </span>

        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          disabled={loading}
          className="w-full rounded-lg border bg-white p-3 text-slate-900"
        >
          <option value="bank_transfer">
            Bank Transfer
          </option>

          <option value="payment_agent">
            Payment Agent
          </option>

          <option value="other">
            Other Approved Method
          </option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold">
          Payment Reference
        </span>

        <input
          type="text"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          maxLength={200}
          minLength={3}
          placeholder="Enter verified transaction reference"
          required
          disabled={loading}
          className="w-full rounded-lg border bg-white p-3 text-slate-900"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold">
          Payment Verification Notes
        </span>

        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Record how the payment was verified. Do not include sensitive banking information."
          required
          disabled={loading}
          className="w-full rounded-lg border bg-white p-3 text-slate-900"
        />
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={verified}
          onChange={(event) => setVerified(event.target.checked)}
          required
          disabled={loading}
          className="mt-1"
        />

        <span>
          I confirm that the full invoice amount has been
          received and independently verified.
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={loading || !verified}
          className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading
            ? 'Confirming Payment...'
            : 'Confirm and Mark as Paid'}
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setOpen(false);
            setVerified(false);
            setError('');
          }}
          className="rounded-lg border px-5 py-3 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
