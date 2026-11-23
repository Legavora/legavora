
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';
import Logout from '@/components/Logout';

export const dynamic = 'force-dynamic';

type StaffRole = 'manager' | 'specialist';

function roleLabel(role: StaffRole): string {
  return role === 'manager'
    ? 'Publishing Manager'
    : 'Publishing Specialist';
}

export default async function StaffDashboard() {
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error } = await db
    .from('profiles')
    .select('full_name,role')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    throw new Error(
      'Unable to verify your Legavora account.'
    );
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
    redirect('/');
  }

  const staffRole = profile.role as StaffRole;

  const displayName =
    profile.full_name?.trim() ||
    user.email ||
    'Team Member';

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

        <Logout />
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
        <div className="panel">
          <h2 className="font-semibold text-lg">
            Publishing Assignments
          </h2>

          <p className="text-slate-600 mt-3">
            Your assigned publishing projects
            will appear here when the assignment
            system is connected.
          </p>
        </div>

        <div className="panel">
          <h2 className="font-semibold text-lg">
            Editorial Workflow
          </h2>

          <p className="text-slate-600 mt-3">
            Track manuscript reviews, production
            milestones, and editorial tasks
            assigned to your account.
          </p>
        </div>

        <div className="panel">
          <h2 className="font-semibold text-lg">
            Team Collaboration
          </h2>

          <p className="text-slate-600 mt-3">
            Collaborate on authorized publishing
            projects and communicate with
            the Legavora team.
          </p>
        </div>
      </section>

      <section className="panel mt-10">
        <h2 className="heading text-2xl">
          Your Workspace
        </h2>

        <p className="text-slate-600 mt-4">
          Your staff account is active.
          Publishing assignments and operational
          tools will become available as
          Legavora's staff workflow is configured.
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
