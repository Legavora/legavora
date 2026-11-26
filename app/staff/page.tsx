import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';
import Logout from '@/components/Logout';
import NotificationBell from '@/components/NotificationBell';

export const dynamic = 'force-dynamic';

type StaffRole = 'manager' | 'specialist';

type Assignment = {
  id: string;
  project_id: string;
  assignment_role: string;
  status: string;
  assigned_at: string;
  completed_at: string | null;
  notes: string | null;
};

type ProjectSummary = {
  id: string;
  title: string;
  status: string;
  stage: string;
};

function roleLabel(role: StaffRole): string {
  return role === 'manager'
    ? 'Publishing Manager'
    : 'Publishing Specialist';
}

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

export default async function StaffDashboard() {
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('full_name,role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(
      'Unable to verify your Legavora account.'
    );
  }

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'author') redirect('/dashboard');

  if (
    profile.role !== 'manager' &&
    profile.role !== 'specialist'
  ) {
    redirect('/');
  }

  const staffRole = profile.role as StaffRole;

  const displayName =
    profile.full_name?.trim() ||
    user.email ||
    'Team Member';

  const { data: assignmentRows, error: assignmentsError } =
    await db
      .from('project_assignments')
      .select(
        'id,project_id,assignment_role,status,assigned_at,completed_at,notes'
      )
      .eq('staff_id', user.id)
      .order('assigned_at', { ascending: false });

  if (assignmentsError) {
    throw new Error(
      'Unable to load your publishing assignments.'
    );
  }

  const assignments = (assignmentRows || []) as Assignment[];

  const projectIds = [
    ...new Set(
      assignments.map((assignment) => assignment.project_id)
    ),
  ];

  let projects: ProjectSummary[] = [];

  if (projectIds.length > 0) {
    const { data: projectRows, error: projectsError } =
      await db
        .from('projects')
        .select('id,title,status,stage')
        .in('id', projectIds);

    if (projectsError) {
      throw new Error(
        'Unable to load the projects for your assignments.'
      );
    }

    projects = (projectRows || []) as ProjectSummary[];
  }

  const projectsById = new Map(
    projects.map((project) => [project.id, project])
  );

  const activeAssignments = assignments.filter(
    (assignment) => assignment.status === 'active'
  );

  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === 'completed'
  );

  const activeProjectCount = new Set(
    activeAssignments.map(
      (assignment) => assignment.project_id
    )
  ).size;

  return (
    <main className="max-w-7xl mx-auto px-5 py-14">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="eyebrow">
            LEGAVORA TEAM WORKSPACE
          </p>

          <h1 className="heading text-4xl mt-3">
            Publishing Staff Dashboard
          </h1>

          <p className="text-slate-600 mt-3">
            Welcome, {displayName}.
          </p>

          <p className="text-sm text-slate-600 mt-2">
            Your role: {roleLabel(staffRole)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <NotificationBell />
          <Logout />
        </div>
      </div>

      <section
        className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10"
        aria-label="Assignment overview"
      >
        <div className="panel">
          <h2 className="font-semibold text-lg">
            Active Assignments
          </h2>

          <p className="font-serif text-4xl mt-3">
            {activeAssignments.length}
          </p>

          <p className="text-sm text-slate-600 mt-2">
            Responsibilities currently assigned to you.
          </p>
        </div>

        <div className="panel">
          <h2 className="font-semibold text-lg">
            Active Projects
          </h2>

          <p className="font-serif text-4xl mt-3">
            {activeProjectCount}
          </p>

          <p className="text-sm text-slate-600 mt-2">
            Publishing projects with active responsibilities.
          </p>
        </div>

        <div className="panel">
          <h2 className="font-semibold text-lg">
            Completed Assignments
          </h2>

          <p className="font-serif text-4xl mt-3">
            {completedAssignments.length}
          </p>

          <p className="text-sm text-slate-600 mt-2">
            Responsibilities marked completed.
          </p>
        </div>
      </section>

      <section
        className="mt-10"
        aria-labelledby="assignments-heading"
      >
        <div className="space-y-2">
          <p className="eyebrow">
            YOUR PUBLISHING WORK
          </p>

          <h2
            id="assignments-heading"
            className="heading text-3xl"
          >
            My Project Assignments
          </h2>

          <p className="text-slate-600">
            View your responsibilities, project progress,
            and assignment notes.
          </p>
        </div>

        {assignments.length === 0 ? (
          <div className="panel mt-5">
            <h3 className="font-semibold text-lg">
              No assignments yet
            </h3>

            <p className="text-slate-600 mt-2">
              Your staff account is active. Projects assigned
              to you by Legavora&apos;s publishing management
              team will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            {assignments.map((assignment) => {
              const project = projectsById.get(
                assignment.project_id
              );

              return (
                <article
                  key={assignment.id}
                  className="panel space-y-4"
                >
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Publishing Project
                      </p>

                      <h3 className="font-serif text-2xl mt-1">
                        {project?.title ||
                          'Project details unavailable'}
                      </h3>
                    </div>

                    <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                      {readable(assignment.status)}
                    </span>
                  </div>

                  <div className="border-t pt-4 space-y-2 text-sm">
                    <p>
                      <span className="font-semibold">
                        Your responsibility:
                      </span>{' '}
                      {readable(assignment.assignment_role)}
                    </p>

                    {project && (
                      <>
                        <p>
                          <span className="font-semibold">
                            Project status:
                          </span>{' '}
                          {readable(project.status)}
                        </p>

                        <p>
                          <span className="font-semibold">
                            Production stage:
                          </span>{' '}
                          {readable(project.stage)}
                        </p>
                      </>
                    )}

                    <p>
                      <span className="font-semibold">
                        Assigned:
                      </span>{' '}
                      {dateLabel(assignment.assigned_at)}
                    </p>

                    {assignment.completed_at && (
                      <p>
                        <span className="font-semibold">
                          Completed:
                        </span>{' '}
                        {dateLabel(assignment.completed_at)}
                      </p>
                    )}
                  </div>

                  {assignment.notes && (
                    <div className="border-t pt-4">
                      <p className="font-semibold text-sm">
                        Assignment Notes
                      </p>

                      <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                        {assignment.notes}
                      </p>
                    </div>
                  )}

                  {assignment.status === 'active' && project && (
                    <div className="border-t pt-4">
                      <Link
                        href={`/staff/projects/${project.id}`}
                        className="inline-flex items-center justify-center rounded-lg bg-[#d8b879] px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-[#caa562] transition-colors"
                      >
                        Open Project Workspace
                      </Link>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel mt-10">
        <h2 className="heading text-2xl">
          Your Workspace
        </h2>

        <p className="text-slate-600 mt-4">
          This dashboard shows assignments linked to your
          Legavora staff account. Open an assigned project
          to view its details and your responsibilities.
          Additional editorial tools and collaboration
          features will be introduced through dedicated,
          permission-controlled workflows.
        </p>

        <div className="mt-6">
          <Link
            href="/"
            className="text-sm font-semibold underline text-[#a67c36]"
          >
            Visit Legavora Website
          </Link>
        </div>
      </section>
    </main>
  );
}
