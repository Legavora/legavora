
import { currentUser } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Logout from '@/components/Logout';

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

export default async function Dashboard() {
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

  if (profile.role !== 'author') {
    throw new Error('This workspace is for authors only.');
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
        'id,amount_cents,currency,status,description'
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

        <Logout />
      </div>

      {/* WORKSPACE OVERVIEW */}
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

      {/* PUBLISHING PROJECTS */}
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

      {/* EDITORIAL REVISION REQUESTS */}
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
                      {new Date(
                        review.created_at
                      ).toLocaleDateString(
                        'en-GB',
                        {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        }
                      )}
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

      {/* INVOICES */}
      <h2 className="heading text-3xl mt-12">
        Invoices
      </h2>

      <div className="grid gap-3 mt-5">
        {invoices?.length ? (
          invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="panel flex justify-between flex-wrap items-center gap-3"
            >
              <div>
                <p className="font-semibold">
                  {invoice.description ||
                    'Publishing services'}
                </p>

                <p className="text-sm text-slate-600">
                  {readable(invoice.status)}
                  {' · '}
                  {invoice.currency}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <b>
                  {invoice.currency}{' '}
                  {(
                    invoice.amount_cents / 100
                  ).toFixed(2)}
                </b>

                {invoice.status === 'pending' && (
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
            </div>
          ))
        ) : (
          <div className="panel">
            No invoices yet.
          </div>
        )}
      </div>
    </div>
  );
}
