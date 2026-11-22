
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type StaffRole = 'admin' | 'manager' | 'specialist';

type StaffProfile = {
  id: string;
  full_name: string | null;
  role: StaffRole;
  created_at: string;
};

type StaffInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return 'Not available';

  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function StaffManagementPage() {
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: currentProfile, error: profileError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    profileError ||
    !currentProfile ||
    currentProfile.role !== 'admin'
  ) {
    redirect('/dashboard');
  }

  const [staffResult, invitationsResult] = await Promise.all([
    db
      .from('profiles')
      .select('id,full_name,role,created_at')
      .in('role', ['admin', 'manager', 'specialist'])
      .order('created_at', { ascending: false }),

    db
      .from('staff_invitations')
      .select(
        'id,email,role,status,created_at,expires_at,accepted_at'
      )
      .order('created_at', { ascending: false }),
  ]);

  const staff = (staffResult.data ?? []) as StaffProfile[];
  const invitations = (invitationsResult.data ??
    []) as StaffInvitation[];

  const pendingInvitations = invitations.filter(
    (invitation) =>
      invitation.status === 'pending' &&
      new Date(invitation.expires_at).getTime() > Date.now()
  );

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <p className="eyebrow">LEGAVORA OPERATIONS</p>

      <h1 className="heading text-4xl mt-3">
        Staff Management
      </h1>

      <p className="text-slate-600 mt-3">
        Manage Legavora's publishing operations team,
        review staff roles, and monitor staff invitations.
      </p>

      <div className="mt-6">
        <Link
          href="/admin"
          className="text-sm font-semibold underline text-[#a67c36]"
        >
          Back to Administration
        </Link>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
        <div className="panel">
          <p className="text-sm text-slate-600">
            Registered Staff
          </p>
          <p className="text-3xl font-semibold mt-3">
            {staffResult.error ? 'Unavailable' : staff.length}
          </p>
        </div>

        <div className="panel">
          <p className="text-sm text-slate-600">
            Pending Invitations
          </p>
          <p className="text-3xl font-semibold mt-3">
            {invitationsResult.error
              ? 'Unavailable'
              : pendingInvitations.length}
          </p>
        </div>

        <div className="panel">
          <p className="text-sm text-slate-600">
            Total Invitation Records
          </p>
          <p className="text-3xl font-semibold mt-3">
            {invitationsResult.error
              ? 'Unavailable'
              : invitations.length}
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="heading text-3xl">
          Registered Team Members
        </h2>

        <p className="text-slate-600 mt-3">
          Administrators, publishing managers, and specialists
          registered on the Legavora platform.
        </p>

        {staffResult.error ? (
          <div className="panel mt-6">
            <p className="text-red-700">
              Unable to load staff records.
            </p>
          </div>
        ) : staff.length === 0 ? (
          <div className="panel mt-6">
            <p className="text-slate-600">
              No registered staff members found.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 mt-6">
            {staff.map((member) => (
              <article className="panel" key={member.id}>
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-xl">
                      {member.full_name || 'Unnamed Team Member'}
                    </h3>

                    <p className="text-sm text-slate-600 mt-2">
                      Role: {formatLabel(member.role)}
                    </p>

                    <p className="text-sm text-slate-500 mt-2">
                      Registered: {formatDate(member.created_at)}
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-slate-700">
                    {member.id === user.id
                      ? 'Your Account'
                      : 'Team Member'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="heading text-3xl">
          Staff Invitations
        </h2>

        <p className="text-slate-600 mt-3">
          Review invitations issued to prospective managers
          and publishing specialists.
        </p>

        {invitationsResult.error ? (
          <div className="panel mt-6">
            <p className="text-red-700">
              Unable to load invitation records.
            </p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="panel mt-6">
            <p className="text-slate-600">
              No staff invitations have been created yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 mt-6">
            {invitations.map((invitation) => {
              const expired =
                invitation.status === 'pending' &&
                new Date(invitation.expires_at).getTime() <=
                  Date.now();

              return (
                <article className="panel" key={invitation.id}>
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">
                        {invitation.email}
                      </h3>

                      <p className="text-sm text-slate-600 mt-2">
                        Invited as: {formatLabel(invitation.role)}
                      </p>

                      <p className="text-sm text-slate-500 mt-2">
                        Created: {formatDate(invitation.created_at)}
                      </p>

                      <p className="text-sm text-slate-500 mt-1">
                        Expires: {formatDate(invitation.expires_at)}
                      </p>
                    </div>

                    <div className="text-sm font-semibold text-slate-700">
                      {expired
                        ? 'Expired'
                        : formatLabel(invitation.status)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
