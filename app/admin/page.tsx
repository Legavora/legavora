
import Link from 'next/link';
import { currentUser } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import AdminTools from '@/components/AdminTools';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    !profile ||
    !['admin', 'manager'].includes(profile.role)
  ) {
    redirect('/dashboard');
  }

  const [
    { data: projects, error: projectsError },
    { data: invoices, error: invoicesError },
    { count: totalProjects, error: totalError },
    { count: activeProjects, error: activeError },
    { count: registeredAuthors, error: authorsError },
    { count: awaitingAttention, error: attentionError },
  ] = await Promise.all([
    db
      .from('projects')
      .select(
        'id,title,status,stage,author_id,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(100),

    db
      .from('invoices')
      .select(
        'id,description,status,amount_cents,currency'
      )
      .limit(100),

    db
      .from('projects')
      .select('*', { count: 'exact', head: true }),

    db
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .in('status', ['in_review', 'in_progress']),

    db
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'author'),

    db
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'submitted'),
  ]);

  const metrics = [
    {
      label: 'Total Projects',
      value: totalError
        ? 'Unavailable'
        : totalProjects ?? 0,
      description: 'All publishing projects',
    },
    {
      label: 'Active Projects',
      value: activeError
        ? 'Unavailable'
        : activeProjects ?? 0,
      description: 'In review or in progress',
    },
    {
      label: 'Registered Authors',
      value: authorsError
        ? 'Unavailable'
        : registeredAuthors ?? 0,
      description: 'Author accounts',
    },
    {
      label: 'Awaiting Attention',
      value: attentionError
        ? 'Unavailable'
        : awaitingAttention ?? 0,
      description: 'Newly submitted projects',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-5 py-16">
      <p className="eyebrow">
        LEGAVORA OPERATIONS
      </p>

      <h1 className="heading text-4xl mt-3">
        Administration
      </h1>

      <p className="text-slate-600 mt-3">
        Manage publishing projects, authors, invoices,
        approvals and distribution operations.
      </p>

      {/* Administrator Navigation */}
      <div className="flex flex-wrap gap-4 mt-8">
        <Link
          href="/admin/authors"
          className="btn inline-flex items-center justify-center"
        >
          Manage Authors
        </Link>
      </div>

      {/* Operations Overview */}
      <section className="mt-12">
        <h2 className="heading text-3xl">
          Operations Overview
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {metrics.map((metric) => (
            <div
              className="panel"
              key={metric.label}
            >
              <p className="text-sm text-slate-600">
                {metric.label}
              </p>

              <p className="text-3xl font-semibold mt-3">
                {metric.value}
              </p>

              <p className="text-sm text-slate-500 mt-2">
                {metric.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Publishing Projects */}
      <section className="mt-12">
        <h2 className="heading text-3xl">
          Publishing Projects
        </h2>

        {projectsError ? (
          <p className="mt-5 text-red-700">
            Unable to load publishing projects.
          </p>
        ) : !projects?.length ? (
          <p className="mt-5 text-slate-600">
            No publishing projects found.
          </p>
        ) : (
          <div className="grid gap-4 mt-5">
            {projects.map((project) => (
              <div
                className="panel"
                key={project.id}
              >
                <h3 className="font-serif text-xl">
                  {project.title}
                </h3>

                <p className="text-sm text-slate-600 mt-2">
                  {project.status} · {project.stage}
                </p>

                <AdminTools
                  projectId={project.id}
                  currentStage={project.stage}
                  currentStatus={project.status}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Invoices */}
      <section className="mt-12">
        <h2 className="heading text-3xl">
          Recent Invoices
        </h2>

        {invoicesError ? (
          <p className="mt-4 text-slate-600">
            Invoice records are currently unavailable.
          </p>
        ) : !invoices?.length ? (
          <p className="mt-4 text-slate-600">
            No invoices found.
          </p>
        ) : (
          <div className="grid gap-3 mt-4">
            {invoices.map((invoice) => (
              <div
                className="panel flex justify-between gap-4"
                key={invoice.id}
              >
                <span>
                  {invoice.description} · {invoice.status}
                </span>

                <b>
                  {invoice.currency}{' '}
                  {(invoice.amount_cents / 100).toFixed(2)}
                </b>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
