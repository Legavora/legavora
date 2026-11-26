
import { currentUser } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Logout from '@/components/Logout';
import NotificationBell from '@/components/NotificationBell';

export const dynamic = 'force-dynamic';

type EditorialReview = {
  id: string;
  project_id: string;
  file_id: string;
  decision: string;
  review_notes: string;
  created_at: string;
};

function readable(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function Dashboard() {
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Unable to verify account role.');
  }

  if (profile.role === 'admin') {
    redirect('/admin');
  }

  if (
    profile.role === 'manager' ||
    profile.role === 'specialist'
  ) {
    redirect('/staff');
  }

  if (profile.role !== 'author') {
    redirect('/');
  }

  const [
    { data: projects, error: projectsError },
    { data: invoices, error: invoicesError },
  ] = await Promise.all([
    db
      .from('projects')
      .select('id,title,status,stage,created_at')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false }),

    db
      .from('invoices')
      .select(
        'id,amount_cents,currency,status,description,invoice_number,due_date,paid_at,created_at,project_id'
      )
      .eq('author_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (projectsError || invoicesError) {
    throw new Error(
      'Unable to load your publishing workspace.'
    );
  }

  const projectIds = (projects || []).map(
    (project) => project.id
  );

  let editorialReviews: EditorialReview[] = [];

  if (projectIds.length > 0) {
    const { data: reviews, error: reviewsError } =
      await db
        .from('manuscript_reviews')
        .select(
          'id,project_id,file_id,decision,review_notes,created_at'
        )
        .in('project_id', projectIds)
        .eq('decision', 'revision_requested')
        .eq('visibility', 'author_visible')
        .order('created_at', { ascending: false });

    if (reviewsError) {
      throw new Error(
        'Unable to load editorial revision requests.'
      );
    }

    editorialReviews = reviews || [];
  }

  const projectNames = new Map(
    (projects || []).map((project) => [
      project.id,
      project.title,
    ])
  );

  return (
    <div className="max-w-7xl mx-auto px-5 py-14">
      <div className="flex justify-between flex-wrap gap-4 items-center">
        <div>
          <p className="eyebrow">AUTHOR PORTAL</p>

          <h1 className="heading text-4xl mt-2">
            My Publishing Workspace
          </h1>

          <p className="text-slate-600 mt-2">
            {user.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <NotificationBell />
          <Logout />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5 mt-10">
        <div className="panel">
          <p className="text-slate-500">
            My projects
          </p>

          <p className="text-4xl font-serif mt-2">
            {projects?.length || 0}
          </p>
        </div>

        <div className="panel">
          <p className="text-slate-500">
            Awaiting payment
          </p>

          <p className="text-4xl font-serif mt-2">
            {invoices?.filter(
              (invoice) =>
                invoice.status === 'pending'
            ).length || 0}
          </p>
        </div>

        <div className="panel">
          <p className="text-slate-500">
            Your royalties
          </p>

          <p className="text-sm mt-4">
            Paid directly by your distributors,
            not Legavora.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center mt-12">
        <h2 className="heading text-3xl">
          Publishing projects
        </h2>

        <Link
          href="/dashboard/new"
          className="btn"
        >
          New Project
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mt-5">
        {projects?.length ? (
          projects.map((project) => (
            <Link
              href={`/dashboard/projects/${project.id}`}
              className="panel hover:border-gold"
              key={project.id}
            >
              <h3 className="font-serif text-2xl">
                {project.title}
              </h3>

              <p className="mt-3 text-slate-600">
                Status: {readable(project.status)}
              </p>

              <p className="text-slate-600">
                Stage: {readable(project.stage)}
              </p>
            </Link>
          ))
        ) : (
          <div className="panel">
            You have no projects yet. Start by
            submitting your manuscript.
          </div>
        )}
      </div>

      <section className="mt-12">
        <div className="space-y-2">
          <h2 className="heading text-3xl">
            Editorial Revision Requests
          </h2>

          <p className="text-slate-600">
            Review editorial feedback from the
            Legavora publishing team.
          </p>
        </div>

        <div className="grid gap-4 mt-5">
          {editorialReviews.length ? (
            editorialReviews.map((review) => (
              <div
                key={review.id}
                className="panel space-y-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl">
                      {projectNames.get(
                        review.project_id
                      ) || 'Publishing Project'}
                    </h3>

                    <p className="text-sm text-slate-600 mt-1">
                      Requested:{' '}
                      {formatDate(review.created_at)}
                    </p>
                  </div>

                  <span className="text-sm font-semibold">
                    Revision Requested
                  </span>
                </div>

                <div className="border-t pt-4">
                  <p className="font-semibold">
                    Editorial Feedback
                  </p>

                  <p className="mt-2 text-slate-700 whitespace-pre-wrap">
                    {review.review_notes}
                  </p>
                </div>

                <div className="border-t pt-4">
                  <Link
                    href={`/dashboard/projects/${review.project_id}`}
                    className="text-sm font-semibold underline"
                  >
                    Open Publishing Project
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="panel">
              No editorial revision requests
              have been recorded for your
              publishing projects.
            </div>
          )}
        </div>
      </section>

      {/* AUTHOR FINANCIAL DOCUMENTS */}

      <section className="mt-12 space-y-5">
        <div className="space-y-2">
          <h2 className="heading text-3xl">
            Invoices and Payment Receipts
          </h2>

          <p className="text-slate-600">
            View your publishing invoices, track
            payment status and download your
            financial documents.
          </p>
        </div>

        <div className="grid gap-4">
          {invoices?.length ? (
            invoices.map((invoice) => (
              <article
                key={invoice.id}
                className="panel space-y-5"
              >
                <div className="flex flex-wrap justify-between items-start gap-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-slate-500">
                      {invoice.invoice_number ||
                        'Service Invoice'}
                    </p>

                    <h3 className="font-serif text-xl break-words">
                      {invoice.description ||
                        'Publishing services'}
                    </h3>

                    {invoice.project_id && (
                      <p className="text-sm text-slate-600">
                        Project:{' '}
                        {projectNames.get(
                          invoice.project_id
                        ) || 'Publishing Project'}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-2xl font-semibold">
                      {invoice.currency}{' '}
                      {(
                        invoice.amount_cents / 100
                      ).toFixed(2)}
                    </p>

                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                        invoice.status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : invoice.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {readable(invoice.status)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 rounded-lg border bg-slate-50 p-4">
                  <div>
                    <p className="text-xs text-slate-500">
                      Invoice Issue Date
                    </p>

                    <p className="text-sm font-semibold mt-1">
                      {formatDate(invoice.created_at)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Payment Due Date
                    </p>

                    <p className="text-sm font-semibold mt-1">
                      {invoice.due_date
                        ? formatDate(invoice.due_date)
                        : 'Not specified'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Payment Confirmation
                    </p>

                    <p className="text-sm font-semibold mt-1">
                      {invoice.status === 'paid' &&
                      invoice.paid_at
                        ? formatDate(invoice.paid_at)
                        : 'Not applicable'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                  <a
                    href={`/api/invoices/download?id=${encodeURIComponent(
                      invoice.id
                    )}&type=invoice`}
                    className="rounded-lg border px-4 py-3 text-sm font-semibold hover:bg-slate-50"
                  >
                    Download Invoice (PDF)
                  </a>

                  {invoice.status === 'paid' &&
                    invoice.paid_at && (
                      <a
                        href={`/api/invoices/download?id=${encodeURIComponent(
                          invoice.id
                        )}&type=receipt`}
                        className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
                      >
                        Download Receipt (PDF)
                      </a>
                    )}

                  {invoice.status === 'pending' && paymentsEnabled && (
                    <form
                      action="/api/paystack/initialize"
                      method="POST"
                    >
                      <input
                        type="hidden"
                        name="invoice_id"
                        value={invoice.id}
                      />

                      <button
                        type="submit"
                        className="btn"
                      >
                        Pay Invoice
                      </button>
                    </form>
                  )}
                </div>

                {invoice.status === 'pending' && !paymentsEnabled && (
                  <p className="text-sm text-slate-600">
                    Online payments are currently unavailable. Please contact{' '}
                    <a href="mailto:hello@legavora.com" className="font-semibold underline">
                      hello@legavora.com
                    </a>{' '}
                    for payment arrangements.
                  </p>
                )}

                {invoice.status === 'paid' &&
                  invoice.paid_at && (
                    <p className="text-sm text-green-700">
                      Your payment has been recorded.
                      Your payment receipt is available
                      for download.
                    </p>
                  )}
              </article>
            ))
          ) : (
            <div className="panel">
              No invoices have been issued to your
              account yet.
            </div>
          )}
        </div>

        <div className="rounded-lg border p-5 space-y-2">
          <h3 className="font-semibold">
            Financial Support
          </h3>

          <p className="text-sm text-slate-600">
            For questions about invoices, payment
            arrangements or financial documents,
            please contact our support team.
          </p>

          <a
            href="mailto:hello@legavora.com"
            className="text-sm font-semibold underline"
          >
            hello@legavora.com
          </a>
        </div>
      </section>
    </div>
  );
}
