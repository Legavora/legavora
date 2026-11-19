
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Author = {
  id: string;
  full_name: string | null;
  author_number: number | null;
};

type Project = {
  id: string;
  title: string;
  author_id: string;
};

type InvoiceManagerProps = {
  authors: Author[];
  projects: Project[];
};

export default function InvoiceManager({
  authors,
  projects,
}: InvoiceManagerProps) {
  const router = useRouter();

  const [authorId, setAuthorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const authorProjects = projects.filter(
    (project) => project.author_id === authorId
  );

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSuccess(false);

    if (!authorId) {
      setMessage('Please select an author.');
      return;
    }

    if (description.trim().length < 3) {
      setMessage('Please enter a service description.');
      return;
    }

    const amountText = amount.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(amountText)) {
      setMessage('Enter a valid USD amount.');
      return;
    }

    const [dollars, cents = ''] = amountText.split('.');

    const amountCents =
      Number(dollars) * 100 +
      Number(cents.padEnd(2, '0'));

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0
    ) {
      setMessage('Enter an amount greater than zero.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author_id: authorId,
          project_id: projectId || null,
          description: description.trim(),
          amount_cents: amountCents,
          currency: 'USD',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to create invoice.'
        );
      }

      setSuccess(true);
      setMessage('Invoice created successfully.');

      setAuthorId('');
      setProjectId('');
      setDescription('');
      setAmount('');

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to create invoice.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <h3 className="font-serif text-2xl">
        Create Author Invoice
      </h3>

      <p className="text-slate-600 mt-2">
        Issue invoices for publishing, editing, formatting,
        cover design, marketing, and other Legavora services.
      </p>

      <form
        onSubmit={createInvoice}
        className="grid gap-5 mt-6"
      >
        <div>
          <label
            htmlFor="invoice-author"
            className="block font-medium mb-2"
          >
            Select Author
          </label>

          <select
            id="invoice-author"
            className="w-full"
            value={authorId}
            required
            disabled={saving}
            onChange={(event) => {
              setAuthorId(event.target.value);
              setProjectId('');
            }}
          >
            <option value="">Choose an author</option>

            {authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.full_name || 'Unnamed Author'}
                {author.author_number != null
                  ? ` (Author #${author.author_number})`
                  : ` (${author.id.slice(0, 8)})`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="invoice-project"
            className="block font-medium mb-2"
          >
            Publishing Project
          </label>

          <select
            id="invoice-project"
            className="w-full"
            value={projectId}
            disabled={!authorId || saving}
            onChange={(event) =>
              setProjectId(event.target.value)
            }
          >
            <option value="">
              No project association
            </option>

            {authorProjects.map((project) => (
              <option
                key={project.id}
                value={project.id}
              >
                {project.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="invoice-description"
            className="block font-medium mb-2"
          >
            Service Description
          </label>

          <textarea
            id="invoice-description"
            className="w-full"
            rows={4}
            maxLength={1000}
            required
            disabled={saving}
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="Example: Professional manuscript editing and paperback formatting"
          />
        </div>

        <div>
          <label
            htmlFor="invoice-amount"
            className="block font-medium mb-2"
          >
            Invoice Amount (USD)
          </label>

          <input
            id="invoice-amount"
            className="w-full"
            type="text"
            inputMode="decimal"
            placeholder="500.00"
            required
            disabled={saving}
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value)
            }
          />

          <p className="text-sm text-slate-500 mt-2">
            Enter the amount in US dollars. For example,
            500.00 represents $500 USD.
          </p>
        </div>

        <div className="border-t pt-5">
          <p className="text-sm text-slate-600">
            Currency: USD
          </p>

          <p className="text-sm text-slate-600 mt-1">
            Initial payment status: Pending
          </p>
        </div>

        <button
          type="submit"
          className="btn w-fit"
          disabled={saving || authors.length === 0}
        >
          {saving
            ? 'Creating Invoice...'
            : 'Create Invoice'}
        </button>

        {message && (
          <p
            role="status"
            className={
              success
                ? 'text-green-700'
                : 'text-red-700'
            }
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
