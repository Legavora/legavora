
import Link from 'next/link';
import { currentUser } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import AdminTools from '@/components/AdminTools';

export const dynamic = 'force-dynamic';

type AuditDetails = {
  previous_stage?: string;
  new_stage?: string;
  previous_status?: string;
  new_status?: string;
};

function formatLabel(value: string | null | undefined) {
  if (!value) return 'Not specified';

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

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
    { data: activities, error: activitiesError },
  ] = await Promise.all([
    db
      .from('projects')
      .select('id,title,status,stage,author_id,created_at')
      .order('created_at', { ascending: false })
      .limit(100),

    db
      .from('invoices')
      .select('id,description,status,amount_cents,currency')
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

    db
      .from('audit_log')
      .select(
        'id,actor_id,action,resource_type,resource_id,details,created_at'
      )
      .eq('action', 'project_updated')
      .eq('resource_type', 'project')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const metrics = [
    {
      label: 'Total Projects',
      value: totalError ? 'Unavailable' : totalProjects ?? 0,
      description: 'All publishing projects',
    },
    {
      label: 'Active Projects',
      value: activeError ? 'Unavailable' : activeProjects ?? 0,
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

  const projectNames = new Map(
    (projects ?? []).map((project) => [
      project.id,
      project.title,
    ])
  );

  const actorIds = Array.from(
    new Set(
      (activities ?? [])
        .map((activity) => activity.actor_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const { data: staffProfiles } = actorIds.length
    ? await db
        .from('profiles')
        .select('id,role')
        .in('id', actorIds)
    : { data: [] as { id: string; role: string }[] };

  const staffRoles = new Map(
    (staffProfiles ?? []).map((staff) => [
      staff.id,
      staff.role,
    ])
  );

  return (
    <div className="max-w-7xl mx-auto px-5 py-16">
      <p className="eyebrow">LEGAVORA OPERATIONS</p>

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
              <div className="panel" key={project.id}>
                <h3 className="font-serif text-xl">
                  {project.title}
                </h3>

                <p className="text-sm text-slate-600 mt-2">
                  {formatLabel(project.status)} ·{' '}
                  {formatLabel(project.stage)}
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

      {/* Project Activity History */}
      <section className="mt-12">
        <div>
          <p className="eyebrow">OPERATIONS RECORD</p>

          <h2 className="heading text-3xl mt-2">
            Project Activity History
          </h2>

          <p className="text-slate-600 mt-3">
            Recent changes to publishing stages and project
            statuses, recorded automatically by Legavora.
          </p>
        </div>

        {activitiesError ? (
          <div className="panel mt-5">
            <p className="text-red-700">
              Activity history is currently unavailable.
            </p>
            <p className="text-sm text-slate-600 mt-2">
              Verify administrator access to the audit_log
              table in Supabase.
            </p>
          </div>
        ) : !activities?.length ? (
          <div className="panel mt-5">
            <p className="font-semibold">
              No project changes recorded yet.
            </p>
            <p className="text-sm text-slate-600 mt-2">
              Changes to publishing stages and statuses will
              appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 mt-6">
            {activities.map((activity) => {
              const details =
                activity.details &&
                typeof activity.details === 'object' &&
                !Array.isArray(activity.details)
                  ? (activity.details as AuditDetails)
                  : {};

              const stageChanged =
                details.previous_stage !== undefined ||
                details.new_stage !== undefined;

              const statusChanged =
                details.previous_status !== undefined ||
                details.new_status !== undefined;

              const staffRole = activity.actor_id
                ? staffRoles.get(activity.actor_id)
                : undefined;

              return (
                <article
                  key={activity.id}
                  className="panel"
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-[#a67c36] font-semibold">
                        Project Updated
                      </p>

                      <h3 className="font-serif text-xl mt-2">
                        {projectNames.get(
                          activity.resource_id ?? ''
                        ) ?? 'Publishing Project'}
                      </h3>
                    </div>

                    <time className="text-sm text-slate-500">
                      {formatDate(activity.created_at)}
                    </time>
                  </div>

                  <div className="mt-4 space-y-3">
                    {statusChanged && (
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-sm font-semibold">
                          Project Status
                        </p>

                        <p className="text-sm text-slate-600 mt-2">
                          {formatLabel(
                            details.previous_status
                          )}
                          {' → '}
                          <span className="font-semibold text-slate-900">
                            {formatLabel(
                              details.new_status
                            )}
                          </span>
                        </p>
                      </div>
                    )}

                    {stageChanged && (
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-sm font-semibold">
                          Publishing Stage
                        </p>

                        <p className="text-sm text-slate-600 mt-2">
                          {formatLabel(
                            details.previous_stage
                          )}
                          {' → '}
                          <span className="font-semibold text-slate-900">
                            {formatLabel(
                              details.new_stage
                            )}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-sm text-slate-600">
                      Changed by:{' '}
                      <span className="font-semibold text-slate-900">
                        {staffRole
                          ? formatLabel(staffRole)
                          : 'Staff account'}
                      </span>
                    </p>

                    <p className="text-xs text-slate-500 mt-2 break-all">
                      Actor ID:{' '}
                      {activity.actor_id ??
                        'Not available'}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-500 mt-4">
          Showing up to 30 recent project updates.
          All dates are displayed in UTC.
        </p>
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
