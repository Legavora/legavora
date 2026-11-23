
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';
import AssignmentNotice from './AssignmentNotice';

type Props = {
  projectId: string;
};

const ASSIGNMENT_ROLES = [
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'editor', label: 'Editor' },
  { value: 'proofreader', label: 'Proofreader' },
  { value: 'formatter', label: 'Formatter' },
  { value: 'cover_designer', label: 'Cover Designer' },
  {
    value: 'publishing_specialist',
    label: 'Publishing Specialist',
  },
] as const;

const STATUSES = ['active', 'completed', 'removed'] as const;

function roleLabel(value: string) {
  return (
    ASSIGNMENT_ROLES.find((role) => role.value === value)?.label ||
    value.replace(/_/g, ' ')
  );
}

async function requireAuthorizedStaff() {
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    error ||
    !profile ||
    !['admin', 'manager'].includes(profile.role)
  ) {
    throw new Error('You are not authorized to manage assignments.');
  }

  return { db, user };
}

async function createAssignment(formData: FormData) {
  'use server';

  const projectId = String(formData.get('project_id') || '');
  const staffId = String(formData.get('staff_id') || '');
  const assignmentRole = String(
    formData.get('assignment_role') || ''
  );
  const notes = String(formData.get('notes') || '').trim();

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !uuidPattern.test(projectId) ||
    !uuidPattern.test(staffId) ||
    !ASSIGNMENT_ROLES.some(
      (role) => role.value === assignmentRole
    ) ||
    notes.length > 5000
  ) {
    throw new Error('Invalid project assignment details.');
  }

  const { db, user } = await requireAuthorizedStaff();

  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    throw new Error('Project not found.');
  }

  const { data: staff, error: staffError } = await db
    .from('profiles')
    .select('id,role')
    .eq('id', staffId)
    .single();

  if (
    staffError ||
    !staff ||
    !['manager', 'specialist'].includes(staff.role)
  ) {
    throw new Error('Select an active Legavora staff account.');
  }

  const { data: existing, error: existingError } = await db
    .from('project_assignments')
    .select('id,status')
    .eq('project_id', projectId)
    .eq('staff_id', staffId)
    .eq('assignment_role', assignmentRole)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    if (existing.status === 'active') {
      redirect(`/admin/projects/${projectId}?assignment_notice=already_active`);
    }

    const { error } = await db
      .from('project_assignments')
      .update({
        status: 'active',
        completed_at: null,
        notes: notes || null,
      })
      .eq('id', existing.id);

    if (error) {
      throw new Error(`Unable to reactivate assignment: ${error.message}`);
    }
  } else {
    const { error } = await db
      .from('project_assignments')
      .insert({
        project_id: projectId,
        staff_id: staffId,
        assigned_by: user.id,
        assignment_role: assignmentRole,
        status: 'active',
        notes: notes || null,
      });

    if (error) {
      throw new Error(`Unable to create assignment: ${error.message}`);
    }
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath('/staff');
  redirect(`/admin/projects/${projectId}?assignment_notice=assigned`);
}

async function updateAssignment(formData: FormData) {
  'use server';

  const projectId = String(formData.get('project_id') || '');
  const assignmentId = String(
    formData.get('assignment_id') || ''
  );
  const status = String(formData.get('status') || '');

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !uuidPattern.test(projectId) ||
    !uuidPattern.test(assignmentId) ||
    !STATUSES.some((allowed) => allowed === status)
  ) {
    throw new Error('Invalid assignment update.');
  }

  const { db } = await requireAuthorizedStaff();

  const { error } = await db
    .from('project_assignments')
    .update({
      status,
      completed_at:
        status === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', assignmentId)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Unable to update assignment: ${error.message}`);
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath('/staff');
  redirect(`/admin/projects/${projectId}?assignment_notice=updated`);
}

export default async function ProjectStaffAssignments({
  projectId,
}: Props) {
  const { db } = await requireAuthorizedStaff();

  const [
    { data: staffMembers, error: staffError },
    { data: assignments, error: assignmentsError },
  ] = await Promise.all([
    db
      .from('profiles')
      .select('id,full_name,role')
      .in('role', ['manager', 'specialist'])
      .order('full_name', { ascending: true }),

    db
      .from('project_assignments')
      .select(
        'id,staff_id,assignment_role,status,assigned_at,completed_at,notes'
      )
      .eq('project_id', projectId)
      .order('assigned_at', { ascending: false }),
  ]);

  if (staffError || assignmentsError) {
    throw new Error(
      'Unable to load staff assignments. Please try again.'
    );
  }

  const staffNames = new Map(
    (staffMembers || []).map((staff) => [
      staff.id,
      staff.full_name || 'Legavora Team Member',
    ])
  );

  const activeCount = (assignments || []).filter(
    (assignment) => assignment.status === 'active'
  ).length;

  return (
    <section className="panel space-y-6">
      <AssignmentNotice />
      <div className="space-y-2">
        <p className="eyebrow">LEGAVORA TEAM OPERATIONS</p>

        <h2 className="heading text-3xl">
          Project Staff Assignments
        </h2>

        <p className="text-sm text-slate-600">
          Assign publishing professionals to this project,
          manage their responsibilities, and track their
          assignment status.
        </p>
      </div>

      <div className="rounded-lg border bg-slate-50 p-4">
        <p className="text-sm text-slate-600">
          Active Assignments
        </p>

        <p className="mt-1 text-3xl font-semibold">
          {activeCount}
        </p>
      </div>

      <form
        action={createAssignment}
        className="space-y-5 rounded-lg border p-5"
      >
        <h3 className="text-lg font-semibold">
          Assign Team Member
        </h3>

        <input
          type="hidden"
          name="project_id"
          value={projectId}
        />

        <label className="block space-y-2 text-sm font-medium">
          <span>Select Staff Member</span>

          <select
            name="staff_id"
            required
            defaultValue=""
            className="w-full rounded-md border bg-white p-3"
          >
            <option value="" disabled>
              Choose a team member
            </option>

            {(staffMembers || []).map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.full_name || 'Unnamed Staff'} —{' '}
                {staff.role === 'manager'
                  ? 'Publishing Manager'
                  : 'Publishing Specialist'}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm font-medium">
          <span>Assignment Responsibility</span>

          <select
            name="assignment_role"
            required
            defaultValue=""
            className="w-full rounded-md border bg-white p-3"
          >
            <option value="" disabled>
              Select responsibility
            </option>

            {ASSIGNMENT_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm font-medium">
          <span>Assignment Notes (Optional)</span>

          <textarea
            name="notes"
            rows={3}
            maxLength={5000}
            placeholder="Describe the work expected from this team member."
            className="w-full rounded-md border bg-white p-3"
          />
        </label>

        {staffMembers?.length ? (
          <button type="submit" className="btn">
            Assign Staff Member
          </button>
        ) : (
          <p className="text-sm text-slate-600">
            No eligible staff accounts are available.
            Invite and activate a team member first.
          </p>
        )}
      </form>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold">
          Assigned Team Members
        </h3>

        {assignments?.length ? (
          assignments.map((assignment) => (
            <article
              key={assignment.id}
              className="rounded-lg border p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {staffNames.get(assignment.staff_id) ||
                      'Legavora Team Member'}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {roleLabel(assignment.assignment_role)}
                  </p>
                </div>

                <span className="rounded-full border px-3 py-1 text-xs font-semibold capitalize">
                  {assignment.status}
                </span>
              </div>

              {assignment.notes && (
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {assignment.notes}
                </p>
              )}

              <p className="text-xs text-slate-500">
                Assigned:{' '}
                {new Date(
                  assignment.assigned_at
                ).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </p>

              <form
                action={updateAssignment}
                className="flex flex-wrap items-end gap-3 border-t pt-4"
              >
                <input
                  type="hidden"
                  name="project_id"
                  value={projectId}
                />

                <input
                  type="hidden"
                  name="assignment_id"
                  value={assignment.id}
                />

                <label className="space-y-2 text-sm font-medium">
                  <span className="block">Assignment Status</span>

                  <select
                    name="status"
                    defaultValue={assignment.status}
                    className="rounded-md border bg-white p-3"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() +
                          status.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" className="btn">
                  Update Status
                </button>
              </form>
            </article>
          ))
        ) : (
          <div className="rounded-lg border p-5">
            <p className="text-sm text-slate-600">
              No team members have been assigned to this
              publishing project yet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
