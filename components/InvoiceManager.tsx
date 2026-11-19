
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Author = {
  id: string;
  email: string;
  full_name?: string | null;
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

  async function createInvoice(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage('');
    setSuccess(false);

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

    if (!authorId || !description.trim()) {
      setMessage('Select an author and enter a description.');
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
        Issue a USD invoice for publishing, production,
        or marketing services.
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
            Author
          </label>

          <select
            id="invoice-author"
            value={authorId}
            onChange={(event) => {
              setAuthorId(event.target.value);
              setProjectId('');
            }}
            required
            disabled={saving}
            className="w-full"
          >
            <option value="">Select an author</option>

            {authors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.full_name || author.email}
                {author.full_name
                  ? ` (${author.email})`
                  : ''}
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
            value={projectId}
            onChange={(event) =>
              setProjectId(event.target.value)
            }
            disabled={!authorId || saving}
            className="w-full"
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
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="Example: Manuscript editing and professional formatting"
            required
            maxLength={1000}
            disabled={saving}
            rows={4}
            className="w-full"
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
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value)
            }
            placeholder="500.00"
            required
            disabled={saving}
            className="w-full"
          />

          <p className="text-sm text-slate-500 mt-2">
            Enter the amount in US dollars.
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-600">
            New invoices will be created with a
            Pending payment status.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving || authors.length === 0}
          className="btn w-fit"
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

