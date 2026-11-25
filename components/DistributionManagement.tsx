
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserDb } from '@/lib/supabase-browser';

type DistributionRecord = {
  id: string;
  platform: string;
  book_format: string | null;
  status: string;
  isbn: string | null;
  external_identifier: string | null;
  retailer_url: string | null;
  submitted_at: string | null;
  published_at: string | null;
  updated_at: string;
};

type Props = {
  projectId: string;
  records: DistributionRecord[];
};

const PLATFORMS = [
  'Amazon KDP',
  'IngramSpark',
  'Draft2Digital',
  'Apple Books',
  'Kobo',
  'Google Play Books',
  'Barnes & Noble Press',
  'Audible',
  'Other',
];

const FORMATS = [
  'ebook',
  'paperback',
  'hardcover',
  'audiobook',
];

const STATUSES = [
  'not_submitted',
  'preparing',
  'submitted',
  'under_review',
  'corrections_required',
  'approved',
  'live',
  'rejected',
  'withdrawn',
];

function format(value: string) {
  if (value === 'ebook') return 'eBook';

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);

    return url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

const EMPTY_FORM = {
  platform: 'Amazon KDP',
  book_format: 'ebook',
  status: 'not_submitted',
  isbn: '',
  external_identifier: '',
  retailer_url: '',
  submitted_at: '',
  published_at: '',
};

const FIELD_CLASS =
  'w-full rounded-lg border bg-white p-3 text-slate-900';

export default function DistributionManagement({
  projectId,
  records,
}: Props) {
  const router = useRouter();

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function change(
    key: keyof typeof EMPTY_FORM,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function reset() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setError('');
    setSuccess('');
  }

  function edit(record: DistributionRecord) {
    setEditingId(record.id);

    setForm({
      platform: record.platform,
      book_format: record.book_format || 'ebook',
      status: record.status,
      isbn: record.isbn || '',
      external_identifier:
        record.external_identifier || '',
      retailer_url: record.retailer_url || '',
      submitted_at: record.submitted_at || '',
      published_at: record.published_at || '',
    });

    setError('');
    setSuccess('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setError('');
    setSuccess('');

    const platform = form.platform.trim();
    const isbn = form.isbn.replace(/[\s-]/g, '');
    const retailerUrl = form.retailer_url.trim();

    if (!platform || platform.length > 100) {
      setError('Enter a valid publishing platform.');
      return;
    }

    if (
      !FORMATS.includes(form.book_format) ||
      !STATUSES.includes(form.status)
    ) {
      setError('Invalid book format or status.');
      return;
    }

    if (
      isbn &&
      !/^(\d{13}|\d{9}[\dXx])$/.test(isbn)
    ) {
      setError('Enter a valid ISBN-10 or ISBN-13 format.');
      return;
    }

    if (retailerUrl && !safeUrl(retailerUrl)) {
      setError('Enter a valid HTTPS retailer link.');
      return;
    }

    if (
      form.submitted_at &&
      form.published_at &&
      form.published_at < form.submitted_at
    ) {
      setError(
        'Publication date cannot precede submission date.'
      );
      return;
    }

    if (
      form.status === 'live' &&
      (!retailerUrl || !form.published_at)
    ) {
      setError(
        'Live books require a retailer link and publication date.'
      );
      return;
    }

    setBusy(true);

    try {
      const db = browserDb();

      const { data: auth, error: authError } =
        await db.auth.getUser();

      if (authError || !auth.user) {
        throw new Error('Please sign in again.');
      }

      const { data: profile, error: profileError } =
        await db
          .from('profiles')
          .select('role')
          .eq('id', auth.user.id)
          .single();

      if (
        profileError ||
        !profile ||
        !['admin', 'manager'].includes(profile.role)
      ) {
        throw new Error('Management access required.');
      }

      const payload = {
        project_id: projectId,
        platform,
        book_format: form.book_format,
        status: form.status,
        isbn: isbn.toUpperCase() || null,
        external_identifier:
          form.external_identifier.trim() || null,
        retailer_url: retailerUrl || null,
        submitted_at: form.submitted_at || null,
        published_at: form.published_at || null,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      };

      const query = editingId
        ? db
            .from('distribution_records')
            .update(payload)
            .eq('id', editingId)
            .eq('project_id', projectId)
        : db
            .from('distribution_records')
            .insert(payload);

      const { data, error: saveError } =
        await query.select('id').single();

      if (saveError || !data) {
        if (saveError?.code === '23505') {
          throw new Error(
            'This platform and book format already exist.'
          );
        }

        throw new Error(
          saveError?.message ||
            'Unable to save distribution record.'
        );
      }

      setSuccess(
        editingId
          ? 'Distribution record updated successfully.'
          : 'Distribution record created successfully.'
      );

      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save distribution record.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-6">
      <div className="space-y-2">
        <h2>Distribution Management</h2>

        <p className="text-sm text-slate-600">
          Manage publishing destinations, book formats,
          ISBNs, publication progress and retailer links.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: 'Distribution Records',
            count: records.length,
          },
          {
            label: 'Under Review',
            count: records.filter(
              (record) =>
                record.status === 'under_review'
            ).length,
          },
          {
            label: 'Live Publications',
            count: records.filter(
              (record) => record.status === 'live'
            ).length,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border p-4"
          >
            <p className="text-sm text-slate-600">
              {item.label}
            </p>

            <p className="mt-2 text-3xl font-bold">
              {item.count}
            </p>
          </div>
        ))}
      </div>

      <form
        onSubmit={save}
        className="rounded-lg border p-5 space-y-5"
      >
        <h3 className="font-semibold">
          {editingId
            ? 'Update Distribution Record'
            : 'Add Distribution Record'}
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Publishing Platform
            </span>

            <input
              list="distribution-platforms"
              value={form.platform}
              onChange={(event) =>
                change('platform', event.target.value)
              }
              maxLength={100}
              required
              disabled={busy}
              className={FIELD_CLASS}
            />

            <datalist id="distribution-platforms">
              {PLATFORMS.map((platform) => (
                <option
                  key={platform}
                  value={platform}
                />
              ))}
            </datalist>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Book Format
            </span>

            <select
              value={form.book_format}
              onChange={(event) =>
                change('book_format', event.target.value)
              }
              disabled={busy}
              className={FIELD_CLASS}
            >
              {FORMATS.map((item) => (
                <option key={item} value={item}>
                  {format(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Distribution Status
            </span>

            <select
              value={form.status}
              onChange={(event) =>
                change('status', event.target.value)
              }
              disabled={busy}
              className={FIELD_CLASS}
            >
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {format(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              ISBN
            </span>

            <input
              value={form.isbn}
              onChange={(event) =>
                change('isbn', event.target.value)
              }
              placeholder="ISBN-10 or ISBN-13"
              maxLength={25}
              disabled={busy}
              className={FIELD_CLASS}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              ASIN / External Identifier
            </span>

            <input
              value={form.external_identifier}
              onChange={(event) =>
                change(
                  'external_identifier',
                  event.target.value
                )
              }
              maxLength={150}
              disabled={busy}
              className={FIELD_CLASS}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Retailer URL
            </span>

            <input
              type="url"
              value={form.retailer_url}
              onChange={(event) =>
                change('retailer_url', event.target.value)
              }
              placeholder="https://..."
              maxLength={2000}
              disabled={busy}
              className={FIELD_CLASS}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Submission Date
            </span>

            <input
              type="date"
              value={form.submitted_at}
              onChange={(event) =>
                change('submitted_at', event.target.value)
              }
              disabled={busy}
              className={FIELD_CLASS}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Publication Date
            </span>

            <input
              type="date"
              value={form.published_at}
              onChange={(event) =>
                change('published_at', event.target.value)
              }
              disabled={busy}
              className={FIELD_CLASS}
            />
          </label>
        </div>

        <p className="text-xs text-slate-600">
          Distribution records track publishing progress.
          Saving a record does not submit a book to a
          retailer or collect author royalties.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? 'Saving...'
              : editingId
                ? 'Update Record'
                : 'Add Distribution Record'}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-lg border px-5 py-3 text-sm"
            >
              Cancel Editing
            </button>
          )}
        </div>
      </form>

      <div className="space-y-4">
        <h3 className="font-semibold">
          Distribution Records
        </h3>

        {records.length === 0 ? (
          <p className="text-sm text-slate-600">
            No distribution records have been added.
          </p>
        ) : (
          records.map((record) => {
            const url = safeUrl(record.retailer_url);

            return (
              <article
                key={record.id}
                className="rounded-lg border p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">
                      {record.platform}
                    </h4>

                    <p className="text-sm text-slate-600">
                      {record.book_format
                        ? format(record.book_format)
                        : 'Format not assigned'}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      record.status === 'live'
                        ? 'bg-green-100 text-green-800'
                        : record.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {format(record.status)}
                  </span>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <p>
                    <strong>ISBN:</strong>{' '}
                    {record.isbn || 'Not assigned'}
                  </p>

                  <p>
                    <strong>External ID:</strong>{' '}
                    {record.external_identifier ||
                      'Not assigned'}
                  </p>

                  <p>
                    <strong>Submitted:</strong>{' '}
                    {record.submitted_at || 'Not submitted'}
                  </p>

                  <p>
                    <strong>Published:</strong>{' '}
                    {record.published_at || 'Not published'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-4">
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold underline"
                    >
                      View Retailer Listing
                    </a>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => edit(record)}
                    className="text-sm font-semibold underline"
                  >
                    Edit Distribution Record
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
