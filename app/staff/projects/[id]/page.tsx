
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

type Assignment = {
  id: string;
  assignment_role: string;
  status: string;
  assigned_at: string;
  completed_at: string | null;
  notes: string | null;
};

function readable(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function StaffProjectPage({
  params,
}: PageProps) {
  const { id: projectId } = await params;
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('full_name,role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('Unable to verify your Legavora account.');
  }

  if (profile.role === 'admin') {
    redirect('/admin');
  }

  if (profile.role === 'author') {
    redirect('/dashboard');
  }

  if (
    profile.role !== 'manager' &&
    profile.role !== 'specialist'
  ) {
    notFound();
  }

  // Access is restricted to the authenticated staff member's
  // active assignments for this specific project.
  const { data: assignmentRows, error: assignmentError } =
    await db
      .from('project_assignments')
      .select(
        'id,assignment_role,status,assigned_at,completed_at,notes'
      )
      .eq('project_id', projectId)
      .eq('staff_id', user.id)
      .eq('status', 'active')
      .order('assigned_at', { ascending: false });

  if (assignmentError) {
    throw new Error('Unable to verify your project assignments.');
  }

  const assignments = (assignmentRows || []) as Assignment[];

  if (assignments.length === 0) {
    notFound();
  }

  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id,title,description,genre,service,status,stage')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    notFound();
  }

  const displayName =
    profile.full_name?.trim() || user.email || 'Team Member';

  return (
    <main className="max-w-6xl mx-auto px-5 py-14">
      <div className="mb-8">
        <Link
          href="/staff"
          className="text-sm font-semibold underline text-[#a67c36]"
        >
          Back to Staff Dashboard
        </Link>
      </div>

      <header className="space-y-3">
        <p className="eyebrow">LEGAVORA TEAM WORKSPACE</p>

        <h1 className="heading text-4xl">
          {project.title}
        </h1>

        <p className="text-slate-600">
          Project workspace for {displayName}.
        </p>
      </header>

      <section
        className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10"
        aria-label="Project overview"
      >
        <div className="panel">
          <h2 className="font-semibold">Project Status</h2>
          <p className="text-xl mt-3">
            {readable(project.status)}
          </p>
        </div>

        <div className="panel">
          <h2 className="font-semibold">Production Stage</h2>
          <p className="text-xl mt-3">
            {readable(project.stage)}
          </p>
        </div>

        <div className="panel">
          <h2 className="font-semibold">
            Active Responsibilities
          </h2>
          <p className="font-serif text-4xl mt-3">
            {assignments.length}
          </p>
        </div>
      </section>

      <section className="panel mt-8">
        <h2 className="heading text-2xl">
          Project Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 text-sm">
          <div>
            <p className="font-semibold">Publishing Service</p>
            <p className="text-slate-600 mt-1">
              {readable(project.service)}
            </p>
          </div>

          <div>
            <p className="font-semibold">Genre</p>
            <p className="text-slate-600 mt-1">
              {project.genre || 'Not specified'}
            </p>
          </div>
        </div>

        {project.description && (
          <div className="border-t mt-6 pt-5">
            <h3 className="font-semibold">
              Project Description
            </h3>
            <p className="text-slate-700 mt-2 whitespace-pre-wrap">
              {project.description}
            </p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <p className="eyebrow">YOUR ASSIGNED WORK</p>

        <h2 className="heading text-3xl mt-2">
          My Responsibilities
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          {assignments.map((assignment) => (
            <article
              key={assignment.id}
              className="panel space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-serif text-2xl">
                  {readable(assignment.assignment_role)}
                </h3>

                <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                  {readable(assignment.status)}
                </span>
              </div>

              <p className="text-sm text-slate-600">
                Assigned: {dateLabel(assignment.assigned_at)}
              </p>

              {assignment.notes && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold text-sm">
                    Assignment Instructions
                  </h4>

                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                    {assignment.notes}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel mt-10">
        <h2 className="heading text-2xl">
          Publishing Workflow
        </h2>

        <p className="text-slate-600 mt-4">
          This workspace is restricted to publishing projects
          assigned to your Legavora staff account.
          Authorized manuscript access, editorial actions,
          and project communication will be introduced
          as the next stages of the staff workflow.
        </p>
      </section>
    </main>
  );
}
