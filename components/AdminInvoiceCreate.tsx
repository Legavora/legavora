
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type Props = {
  projectId: string;
  authorId: string;
};

export default function AdminInvoiceCreate({
  projectId,
  authorId,
}: Props) {
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function createInvoice(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setError('');
    setSuccess('');

    const cleanDescription = description.trim();
    const cleanAmount = amount.trim();

    if (
      !cleanDescription ||
      cleanDescription.length > 2000
    ) {
      setError('Enter a valid service description.');
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(cleanAmount)) {
      setError('Enter a valid USD amount.');
      return;
    }

    const [whole, fraction = ''] = cleanAmount.split('.');

    const amountCents =
      Number(whole) * 100 +
      Number(fraction.padEnd(2, '0'));

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      setError('Enter a valid positive invoice amount.');
      return;
    }

    if (dueDate) {
      const parsedDate = new Date(
        `${dueDate}T00:00:00Z`
      );

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== dueDate
      ) {
        setError('Enter a valid payment due date.');
        return;
      }
    }

    setLoading(true);

    try {
      const db = browserDb();

      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser();

      if (authError || !user) {
        throw new Error('Please sign in again.');
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
          'You are not authorized to create invoices.'
        );
      }

      const {
        data: invoice,
        error: invoiceError,
      } = await db
        .from('invoices')
        .insert({
          project_id: projectId,
          author_id: authorId,
          description: cleanDescription,
          amount_cents: amountCents,
          currency: 'USD',
          status: 'pending',
          paid_at: null,
          due_date: dueDate || null,
        })
        .select('id, invoice_number')
        .single();

      if (invoiceError) {
        throw new Error(invoiceError.message);
      }

      setDescription('');
      setAmount('');
      setDueDate('');

      setSuccess(
        `Invoice ${invoice.invoice_number} created successfully.`
      );

      router.refresh();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create invoice.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel space-y-5">
      <div className="space-y-2">
        <h2>Create Service Invoice</h2>

        <p className="text-sm text-slate-600">
          Create a professional USD invoice for
          publishing, production, marketing or
          other agreed Legavora services.
        </p>
      </div>

      <form
        onSubmit={createInvoice}
        className="space-y-5"
      >
        <label className="block space-y-2">
          <span className="text-sm font-semibold">
            Service Description
          </span>

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="Describe the agreed service or project milestone."
            maxLength={2000}
            rows={4}
            required
            disabled={loading}
            className="w-full rounded-lg border bg-white p-3 text-slate-900"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Invoice Amount
            </span>

            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
              placeholder="500.00"
              required
              disabled={loading}
              className="w-full rounded-lg border bg-white p-3 text-slate-900"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Currency
            </span>

            <input
              value="USD — US Dollar"
              readOnly
              className="w-full rounded-lg border bg-slate-50 p-3 text-slate-900"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Payment Due Date (Optional)
            </span>

            <input
              type="date"
              value={dueDate}
              onChange={(event) =>
                setDueDate(event.target.value)
              }
              disabled={loading}
              className="w-full rounded-lg border bg-white p-3 text-slate-900"
            />

            <p className="text-xs text-slate-500">
              Leave blank if no payment deadline
              has been agreed.
            </p>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Invoice Number
            </span>

            <input
              value="Automatically generated"
              readOnly
              className="w-full rounded-lg border bg-slate-50 p-3 text-slate-900"
            />
          </label>
        </div>

        <div className="rounded-lg border bg-slate-50 p-4">
          <p className="text-sm font-semibold">
            Initial Invoice Status: Pending
          </p>

          <p className="mt-2 text-xs text-slate-600">
            Creating an invoice does not charge the
            author or confirm receipt of payment.
            Live online payment activation is pending.
            Manual payments must be independently
            verified before confirmation.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-sm text-green-700"
          >
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading
            ? 'Creating Invoice...'
            : 'Create Invoice'}
        </button>
      </form>
    </section>
  );
}
