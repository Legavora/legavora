
import Link from 'next/link';
import { currentUser } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import AdminTools from '@/components/AdminTools';
import InvoiceManager from '@/components/InvoiceManager';

export const dynamic = 'force-dynamic';

type ActivityDetails = {
  previous_stage?: string;
  new_stage?: string;
  previous_status?: string;
  new_status?: string;
};

function readable(value: string | null | undefined) {
  if (!value) return 'Not specified';

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(amountCents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}

export default async function Admin() {
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !['admin', 'manager'].includes(profile.role)
  ) {
    redirect('/dashboard');
  }

  const [
    projectsResult,
    invoicesResult,
    authorsResult,
    activityResult,
    totalResult,
    activeResult,
    authorCountResult,
    attentionResult,
  ] = await Promise.all([
    db
      .from('projects')
      .select('id,title,status,stage,author_id,created_at')
      .order('created_at', { ascending: false })
      .limit(100),

    db
      .from('invoices')
      .select(
        'id,author_id,project_id,description,status,amount_cents,currency,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(30),

    db
      .from('profiles')
      .select('id,full_name,author_number')
      .eq('role', 'author')
      .order('created_at', { ascending: false })
      .limit(500),

    db
      .from('audit_log')
      .select(
        'id,actor_id,action,resource_type,resource_id,details,created_at'
      )
      .eq('action', 'project_updated')
      .order('created_at', { ascending: false })
      .limit(30),

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

  const projects = projectsResult.data ?? [];
  const invoices = invoicesResult.data ?? [];
  const authors = authorsResult.data ?? [];
  const activities = activityResult.data ?? [];

  const projectNames = new Map(
    projects.map((project) => [
      project.id,
      project.title,
    ])
  );

  const authorNames = new Map(
    authors.map((author) => [
      author.id,
      author.full_name ||
        `Author #${author.author_number ?? 'Unknown'}`,
    ])
  );

  const metrics = [
    {
      label: 'Total Projects',
      value: totalResult.error
        ? 'Unavailable'
        : totalResult.count ?? 0,
      description: 'All publishing projects',
    },
    {
      label: 'Active Projects',
      value: activeResult.error
        ? 'Unavailable'
        : activeResult.count ?? 0,
      description: 'In review or in progress',
    },
    {
      label: 'Registered Authors',
      value: authorCountResult.error
        ? 'Unavailable'
        : authorCountResult.count ?? 0,
      description: 'Author accounts',
    },
    {
      label: 'Awaiting Attention',
      value: attentionResult.error
        ? 'Unavailable'
        : attentionResult.count ?? 0,
      description: 'Newly submitted projects',
    },
  ];

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <p className="eyebrow">
        LEGAVORA OPERATIONS
      </p>

      <h1 className="heading text-4xl mt-3">
        Administration
      </h1>

      <p className="text-slate-600 mt-3">
        Manage authors, publishing projects, invoices,
        approvals, and distribution operations.
      </p>

      {/* ADMINISTRATOR NAVIGATION */}
      <nav className="flex flex-wrap gap-4 mt-8">
        <Link href="/admin/authors" className="btn">
          Manage Authors
        </Link>
        {profile.role === 'admin' && (
          <Link href="/admin/staff" className="btn">
            Manage Staff
          </Link>
        )}
      </nav>

      {/* OPERATIONS OVERVIEW */}
      <section className="mt-12">
        <h2 className="heading text-3xl">
          Operations Overview
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {metrics.map((metric) => (
            <div className="panel" key={metric.label}>
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

      {/* PUBLISHING PROJECTS */}
      <section className="mt-12">
        <h2 className="heading text-3xl">
          Publishing Projects
        </h2>

        {projectsResult.error ? (
          <p className="mt-5 text-red-700">
            Unable to load publishing projects.
          </p>
        ) : projects.length === 0 ? (
          <p className="mt-5 text-slate-600">
            No publishing projects found.
          </p>
        ) : (
          <div className="grid gap-4 mt-5">
            {projects.map((project) => (
              <div className="panel" key={project.id}>
                <h3 className="font-serif text-xl">
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="hover:underline"
                  >
                    {project.title}
                  </Link>
                </h3>

                <p className="text-sm text-slate-600 mt-2">
                  {readable(project.status)}
                  {' · '}
                  {readable(project.stage)}
                </p>

                <AdminTools
                  projectId={project.id}
                  currentStage={project.stage}
                  currentStatus={project.status}
                />

                <div className="mt-5">
                  <Link
                    href={`/admin/projects/${project.id}`}
                    className="text-sm font-semibold underline text-[#a67c36]"
                  >
                    View Project Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* INVOICE MANAGEMENT */}
      <section className="mt-12">
        <p className="eyebrow">
          FINANCIAL OPERATIONS
        </p>

        <h2 className="heading text-3xl mt-3">
          Invoice Management
        </h2>

        <p className="text-slate-600 mt-3 mb-6">
          Create and manage service invoices for
          registered Legavora authors.
        </p>

        {authorsResult.error || projectsResult.error ? (
          <div className="panel">
            <p className="text-red-700">
              Invoice creation is unavailable because
              author or project records could not be loaded.
            </p>
          </div>
        ) : (
          <InvoiceManager
            authors={authors}
            projects={projects.map((project) => ({
              id: project.id,
              title: project.title,
              author_id: project.author_id,
            }))}
          />
        )}
      </section>

      {/* PROJECT ACTIVITY HISTORY */}
      <section className="mt-12">
        <p className="eyebrow">
          OPERATIONS RECORD
        </p>

        <h2 className="heading text-3xl mt-3">
          Project Activity History
        </h2>

        <p className="text-slate-600 mt-3">
          Recent changes to publishing stages and project
          statuses, recorded automatically by Legavora.
        </p>

        {activityResult.error ? (
          <div className="panel mt-6">
            <p className="text-red-700">
              Activity history is currently unavailable.
            </p>
          </div>
        ) : activities.length === 0 ? (
          <div className="panel mt-6">
            <p className="text-slate-600">
              No project changes have been recorded yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 mt-6">
            {activities.map((activity) => {
              const details =
                (activity.details ?? {}) as ActivityDetails;

              return (
                <article
                  className="panel"
                  key={activity.id}
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <p className="eyebrow">
                        PROJECT UPDATED
                      </p>

                      <h3 className="font-serif text-xl mt-3">
                        {projectNames.get(
                          activity.resource_id ?? ''
                        ) || 'Publishing Project'}
                      </h3>
                    </div>

                    <p className="text-sm text-slate-500">
                      {new Date(
                        activity.created_at
                      ).toLocaleString('en-GB', {
                        timeZone: 'UTC',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {' UTC'}
                    </p>
                  </div>

                  {details.new_stage && (
                    <div className="border rounded-lg p-4 mt-5">
                      <p className="font-semibold">
                        Publishing Stage
                      </p>

                      <p className="mt-2">
                        {readable(details.previous_stage)}
                        {' → '}
                        <strong>
                          {readable(details.new_stage)}
                        </strong>
                      </p>
                    </div>
                  )}

                  {details.new_status && (
                    <div className="border rounded-lg p-4 mt-4">
                      <p className="font-semibold">
                        Project Status
                      </p>

                      <p className="mt-2">
                        {readable(details.previous_status)}
                        {' → '}
                        <strong>
                          {readable(details.new_status)}
                        </strong>
                      </p>
                    </div>
                  )}

                  <p className="text-sm text-slate-600 mt-5">
                    Changed by:{' '}
                    <strong>
                      {activity.actor_id === user.id
                        ? 'Admin (You)'
                        : 'Authorized Staff'}
                    </strong>
                  </p>
                </article>
              );
            })}
          </div>
        )}

        <p className="text-sm text-slate-500 mt-5">
          Showing up to 30 recent project updates.
          All dates are displayed in UTC.
        </p>
      </section>

      {/* RECENT INVOICES */}
      <section className="mt-12">
        <h2 className="heading text-3xl">
          Recent Invoices
        </h2>

        {invoicesResult.error ? (
          <p className="mt-5 text-red-700">
            Invoice records are currently unavailable.
          </p>
        ) : invoices.length === 0 ? (
          <div className="panel mt-5">
            <p className="text-slate-600">
              No invoices have been created yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 mt-5">
            {invoices.map((invoice) => (
              <article
                className="panel"
                key={invoice.id}
              >
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">
                      {invoice.description ||
                        'Publishing Services'}
                    </h3>

                    <p className="text-sm text-slate-600 mt-2">
                      Author:{' '}
                      {authorNames.get(invoice.author_id) ||
                        'Registered Author'}
                    </p>

                    {invoice.project_id && (
                      <p className="text-sm text-slate-600 mt-1">
                        Project:{' '}
                        {projectNames.get(invoice.project_id) ||
                          'Publishing Project'}
                      </p>
                    )}

                    <p className="text-sm text-slate-500 mt-2">
                      Created:{' '}
                      {new Date(
                        invoice.created_at
                      ).toLocaleDateString('en-GB', {
                        timeZone: 'UTC',
                        dateStyle: 'medium',
                      })}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-semibold">
                      {money(
                        invoice.amount_cents,
                        invoice.currency
                      )}
                    </p>

                    <p className="text-sm text-slate-600 mt-2">
                      {readable(invoice.status)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
