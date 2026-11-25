import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';
import AdminRevisionUpload from '@/components/AdminRevisionUpload';
import AdminProofUpload from '@/components/AdminProofUpload';
import ProjectMessages from '@/components/ProjectMessages';
import ProjectStaffAssignments from '@/components/ProjectStaffAssignments';
import ManagementDeliverableReview from '@/components/ManagementDeliverableReview';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

type ReviewRecord = {
  id: string;
  file_id: string;
  reviewer_id: string;
  decision: string;
  review_notes: string;
  visibility: string;
  created_at: string;
};

function format(value: string) {
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

const PRODUCTION_STAGES = [
  { key: 'interior_formatting', label: 'Interior Formatting and Layout' },
  { key: 'cover_design', label: 'Cover Design' },
  { key: 'proofreading', label: 'Proofreading' },
  { key: 'quality_control', label: 'Quality Control' },
  { key: 'author_proof_approval', label: 'Author Proof Approval' },
  { key: 'final_production_approval', label: 'Final Production Approval' },
  { key: 'distribution_preparation', label: 'Distribution Preparation' },
] as const;

const PRODUCTION_STATUSES = [
  'not_started',
  'in_progress',
  'awaiting_review',
  'revision_required',
  'completed',
  'on_hold',
] as const;

async function saveProductionTask(formData: FormData) {
  'use server';

  const projectId = String(formData.get('project_id') || '');
  const taskType = String(formData.get('task_type') || '');
  const status = String(formData.get('status') || '');
  const dueDate = String(formData.get('due_date') || '').trim();
  const notes = String(formData.get('notes') || '').trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) ||
    !PRODUCTION_STAGES.some((stage) => stage.key === taskType) ||
    !PRODUCTION_STATUSES.some((allowed) => allowed === status) ||
    (dueDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) ||
    notes.length > 5000
  ) {
    throw new Error('Invalid production task details');
  }

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
    throw new Error('Administrator access required');
  }

  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    throw new Error('Publishing project not found');
  }

  const { error } = await db
    .from('production_tasks')
    .upsert(
      {
        project_id: projectId,
        task_type: taskType,
        status,
        due_date: dueDate || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'project_id,task_type',
      }
    );

  if (error) {
    throw new Error(
      `Unable to save production task: ${error.message}`
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
}

export default async function AdminProjectDetails({
  params,
}: Props) {
  const { id } = await params;
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(
      'Unable to verify administrator access'
    );
  }

  if (!['admin', 'manager'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const { data: project, error: projectError } = await db
    .from('projects')
    .select(
      'id,title,status,stage,author_id,created_at'
    )
    .eq('id', id)
    .single();

  if (projectError || !project) {
    notFound();
  }

  const { data: author } = await db
    .from('profiles')
    .select('full_name,author_number')
    .eq('id', project.author_id)
    .single();

  const { data: files, error: filesError } = await db
    .from('project_files')
    .select('*')
    .eq('project_id', id)
    .order('created_at', {
      ascending: false,
    });

  const { data: invoices, error: invoicesError } = await db
    .from('invoices')
    .select(
      'id,description,amount_cents,currency,status'
    )
    .eq('project_id', id)
    .order('created_at', {
      ascending: false,
    });

  const { data: reviews, error: reviewsError } = await db
    .from('manuscript_reviews')
    .select(
      'id,file_id,reviewer_id,decision,review_notes,visibility,created_at'
    )
    .eq('project_id', id)
    .order('created_at', {
      ascending: false,
    });

  const { data: proofApprovals, error: approvalsError } = await db
    .from('approvals')
    .select('id,label,status,file_id,author_feedback,created_at,responded_at,approved_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  if (filesError || invoicesError || reviewsError || approvalsError) {
    throw new Error(
      'Unable to load project records'
    );
  }

  const {
    data: productionTasks,
    error: productionError,
  } = await db
    .from('production_tasks')
    .select(
      'id,task_type,status,assigned_to,due_date,notes,updated_at'
    )
    .eq('project_id', id);

  if (productionError) {
    throw new Error(
      `Unable to load production tasks: ${productionError.message}`
    );
  }

  const { data: deliverables, error: deliverablesError } = await db
    .from('staff_deliverables')
    .select('id,assignment_id,submitted_by,file_name,storage_path,size_bytes,submission_notes,status,management_feedback,created_at,reviewed_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  if (deliverablesError) {
    throw new Error('Unable to load staff deliverables');
  }

  const submissions = deliverables || [];
  const specialistIds = Array.from(new Set(submissions.map((item) => item.submitted_by)));
  const assignmentIds = Array.from(new Set(submissions.map((item) => item.assignment_id)));
  const specialistNames = new Map<string, string>();
  const assignmentRoles = new Map<string, string>();

  if (specialistIds.length) {
    const { data: specialists, error } = await db
      .from('profiles')
      .select('id,full_name')
      .in('id', specialistIds);
    if (error) throw new Error('Unable to load deliverable specialists');
    for (const specialist of specialists || []) {
      specialistNames.set(specialist.id, specialist.full_name || 'Legavora Specialist');
    }
  }

  if (assignmentIds.length) {
    const { data: assignments, error } = await db
      .from('project_assignments')
      .select('id,assignment_role')
      .eq('project_id', id)
      .in('id', assignmentIds);
    if (error) throw new Error('Unable to load deliverable assignments');
    for (const assignment of assignments || []) {
      assignmentRoles.set(assignment.id, assignment.assignment_role);
    }
  }

  const managementDeliverables = submissions.map((item) => ({
    id: item.id,
    file_name: item.file_name,
    storage_path: item.storage_path,
    size_bytes: Number(item.size_bytes),
    submission_notes: item.submission_notes,
    status: item.status,
    management_feedback: item.management_feedback,
    created_at: item.created_at,
    reviewed_at: item.reviewed_at,
    specialist_name: specialistNames.get(item.submitted_by) || 'Legavora Specialist',
    assignment_role: assignmentRoles.get(item.assignment_id) || 'specialist',
  }));

  const tasksByType = new Map(
    (productionTasks || []).map((task) => [
      task.task_type,
      task,
    ])
  );

  const reviewHistory: ReviewRecord[] = reviews || [];

  const fileNames = new Map(
    (files || []).map((file) => [
      file.id,
      file.file_name || 'Project file',
    ])
  );

  return (
    <main className="container py-12 space-y-8">
      <Link
        href="/admin"
        className="text-sm underline"
      >
        Back to Administrator Dashboard
      </Link>

      <header className="space-y-3">
        <p className="uppercase tracking-widest text-sm">
          Legavora Publishing Operations
        </p>

        <h1>{project.title}</h1>

        <p>Administrator Project Management</p>
      </header>

      {/* PROJECT OVERVIEW */}
      <section className="panel space-y-4">
        <h2>Project Overview</h2>

        <p>
          <strong>Author:</strong>{' '}
          {author?.full_name || 'Registered Author'}
        </p>

        <p>
          <strong>Author Number:</strong>{' '}
          {author?.author_number
            ? `#${author.author_number}`
            : 'Not assigned'}
        </p>

        <p>
          <strong>Status:</strong>{' '}
          {format(project.status)}
        </p>

        <p>
          <strong>Publishing Stage:</strong>{' '}
          {format(project.stage)}
        </p>

        <p>
          <strong>Created:</strong>{' '}
          {formatDate(project.created_at)}
        </p>
      </section>

      {/* PROJECT STAFF ASSIGNMENTS */}
      <ProjectStaffAssignments projectId={id} />

      {/* STAFF PRODUCTION DELIVERABLES */}
      <ManagementDeliverableReview deliverables={managementDeliverables} />

      {/* PUBLISHING PRODUCTION MANAGEMENT */}
      <section className="panel space-y-6">
        <div className="space-y-2">
          <h2>Publishing Production Management</h2>

          <p className="text-sm text-slate-600">
            Track each production stage separately.
            Only authorized Legavora staff can save
            changes. Authors can view their project's
            progress.
          </p>
        </div>

        <div className="grid gap-5">
          {PRODUCTION_STAGES.map((stage, index) => {
            const task = tasksByType.get(stage.key);
            const currentStatus =
              task?.status || 'not_started';

            return (
              <form
                key={stage.key}
                action={saveProductionTask}
                className="rounded-lg border p-5 space-y-4"
              >
                <input
                  type="hidden"
                  name="project_id"
                  value={id}
                />

                <input
                  type="hidden"
                  name="task_type"
                  value={stage.key}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {index + 1}. {stage.label}
                  </h3>

                  <span className="text-sm font-semibold">
                    {format(currentStatus)}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2 text-sm font-medium">
                    <span>Production Status</span>

                    <select
                      key={`${stage.key}-${currentStatus}`}
                      name="status"
                      defaultValue={currentStatus}
                      className="w-full rounded-md border bg-white p-3 text-slate-900"
                    >
                      {PRODUCTION_STATUSES.map(
                        (status) => (
                          <option
                            key={status}
                            value={status}
                          >
                            {format(status)}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="block space-y-2 text-sm font-medium">
                    <span>Due Date</span>

                    <input
                      key={`${stage.key}-${task?.due_date || ''}`}
                      type="date"
                      name="due_date"
                      defaultValue={task?.due_date || ''}
                      className="w-full rounded-md border bg-white p-3 text-slate-900"
                    />
                  </label>
                </div>

                <label className="block space-y-2 text-sm font-medium">
                  <span>Production Notes</span>

                  <textarea
                    key={`${stage.key}-${task?.updated_at || 'new'}`}
                    name="notes"
                    defaultValue={task?.notes || ''}
                    rows={3}
                    maxLength={5000}
                    placeholder="Record progress, deliverables, or outstanding work."
                    className="w-full rounded-md border bg-white p-3 text-slate-900"
                  />
                </label>

                <p className="text-xs text-slate-600">
                  Assigned staff:{' '}
                  {task?.assigned_to
                    ? 'Assigned'
                    : 'Not assigned'}

                  {task?.updated_at
                    ? ` · Last updated: ${formatDate(task.updated_at)}`
                    : ' · Not yet saved'}
                </p>

                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
                >
                  Save Production Stage
                </button>
              </form>
            );
          })}
        </div>
      </section>

      {/* PROJECT FILES */}
      <section className="panel space-y-4">
        <h2>Project Files</h2>

        <p className="text-sm text-slate-600">
          Review and download files submitted for this
          publishing project. Access is restricted to
          authorized Legavora staff.
        </p>

        {files?.length ? (
          <div className="space-y-4">
            {files.map((file) => {
              const fileName =
                file.file_name ||
                file.filename ||
                'Project file';

              const downloadUrl =
                `/api/files/download?id=${encodeURIComponent(
                  file.id
                )}`;

              const fileReviews = reviewHistory.filter(
                (review) => review.file_id === file.id
              );

              const latestReview = fileReviews.find((review) => review.visibility === 'author_visible');
              const internalReviews = fileReviews.filter((review) => review.visibility === 'internal');

              return (
                <div
                  key={file.id}
                  className="border-b py-4 space-y-3"
                >
                  <p className="font-semibold">
                    {fileName}
                  </p>

                  <p className="text-sm text-slate-600">
                    Uploaded:{' '}
                    {formatDate(file.created_at)}
                  </p>

                  {file.version_number != null && (
                    <p className="text-sm">
                      <strong>Version:</strong>{' '}
                      {file.version_number}
                    </p>
                  )}

                  {file.file_category && (
                    <p className="text-sm">
                      <strong>Category:</strong>{' '}
                      {format(file.file_category)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4">
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold underline"
                    >
                      View File
                    </a>

                    <a
                      href={downloadUrl}
                      className="text-sm font-semibold underline"
                    >
                      Download File
                    </a>
                  </div>

                  <div className="rounded-lg border p-4 space-y-2">
                    <h3 className="font-semibold">
                      Editorial Review
                    </h3>

                    {latestReview ? (
                      <>
                        <p className="text-sm">
                          <strong>
                            Latest Author-Visible Decision:
                          </strong>{' '}
                          {format(latestReview.decision)}
                        </p>

                        <p className="text-sm">
                          <strong>Reviewed:</strong>{' '}
                          {formatDate(
                            latestReview.created_at
                          )}
                        </p>

                        <p className="text-sm whitespace-pre-wrap">
                          {latestReview.review_notes}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">
                        No author-visible editorial decision has been recorded.
                      </p>
                    )}

                    {internalReviews.length > 0 && (
                      <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                        <h4 className="font-semibold">Internal Specialist Recommendations</h4>
                        {internalReviews.map((review) => (
                          <article key={review.id} className="border-b pb-3 space-y-2">
                            <p className="text-sm font-semibold">{format(review.decision)} · {formatDate(review.created_at)}</p>
                            <p className="text-sm whitespace-pre-wrap break-words">{review.review_notes}</p>
                          </article>
                        ))}
                        <p className="text-xs text-slate-600">Internal notes are not author feedback. Use the manuscript review workspace to prepare a separate official decision.</p>
                      </div>
                    )}

                    {file.file_category === 'manuscript' && (
                    <Link
                      href={`/admin/projects/${encodeURIComponent(
                        id
                      )}/reviews/${encodeURIComponent(
                        file.id
                      )}`}
                      className="inline-block text-sm font-semibold underline"
                    >
                      Open Official Editorial Review
                    </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p>
            No project files have been uploaded yet.
          </p>
        )}
      </section>

      {/* ADMINISTRATOR FILE REVISION UPLOAD */}
      <section className="panel space-y-4">
        <h2>File Revisions</h2>
        <p className="text-sm text-slate-600">
          Upload a corrected version of an existing project file.
          Earlier versions remain available in the project history.
        </p>

        {files?.length ? (
          <AdminRevisionUpload
            projectId={id}
            existingFiles={files.map((file) => ({
              id: file.id,
              file_name: file.file_name || 'Project file',
              version_number: file.version_number ?? 1,
            }))}
          />
        ) : (
          <p className="text-sm text-slate-600">
            Upload an initial project file before adding a revision.
          </p>
        )}
      </section>

      {/* EDITORIAL REVIEW HISTORY */}
      <section className="panel space-y-4">
        <h2>Editorial Review History</h2>

        <p className="text-sm text-slate-600">
          Internal recommendations and author-visible editorial decisions are recorded separately below.
        </p>

        {reviewHistory.length ? (
          <div className="space-y-4">
            {reviewHistory.map((review) => (
              <div
                key={review.id}
                className="border-b py-4 space-y-2"
              >
                <p className="font-semibold">
                  {fileNames.get(review.file_id) ||
                    'Project file'}
                </p>

                <p className="text-sm">
                  <strong>Visibility:</strong> {format(review.visibility)}
                </p>
                <p className="text-sm">
                  <strong>Decision:</strong>{' '}
                  {format(review.decision)}
                </p>

                <p className="text-sm">
                  <strong>Date:</strong>{' '}
                  {formatDate(review.created_at)}
                </p>

                <p className="text-sm whitespace-pre-wrap">
                  {review.review_notes}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>
            No editorial reviews have been recorded yet.
          </p>
        )}
      </section>

      {/* ADMINISTRATOR PROOF SUBMISSION */}
      <section className="panel space-y-4">
        <h2>Proof Submission</h2>
        <AdminProofUpload projectId={id} />
      </section>

      {/* AUTHOR PROOF DECISIONS — ADMINISTRATOR ONLY */}
      <section className="panel space-y-4">
        <div className="space-y-2">
          <h2>Author Proof Decisions</h2>
          <p className="text-sm text-slate-600">
            Review author approvals and correction requests. Correction feedback
            is recorded here for Legavora's publishing team. This section does
            not change an author's decision or publish revised files.
          </p>
        </div>

        {proofApprovals?.length ? (
          <div className="space-y-4">
            {proofApprovals.map((approval) => (
              <article
                key={approval.id}
                className="rounded-lg border p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-semibold">{approval.label}</h3>
                  <span className="text-sm font-semibold">
                    {format(approval.status)}
                  </span>
                </div>

                <p className="text-sm text-slate-600">
                  Requested: {formatDate(approval.created_at)}
                </p>

                {approval.responded_at && (
                  <p className="text-sm text-slate-600">
                    Author responded: {formatDate(approval.responded_at)}
                  </p>
                )}

                {approval.approved_at && (
                  <p className="text-sm text-slate-600">
                    Approved: {formatDate(approval.approved_at)}
                  </p>
                )}

                {approval.file_id && (
                  <p className="text-sm">
                    <strong>Related file:</strong>{' '}
                    {fileNames.get(approval.file_id) || 'Project file'}
                  </p>
                )}

                {approval.author_feedback ? (
                  <div className="rounded-md border bg-slate-50 p-4 space-y-2">
                    <p className="text-sm font-semibold">Author Feedback</p>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {approval.author_feedback}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    No written feedback submitted.
                  </p>
                )}

                {['corrections_requested', 'changes_requested'].includes(
                  approval.status
                ) && (
                  <p className="text-sm font-semibold">
                    Action required: Review the author's feedback and prepare a
                    revised proof before requesting approval again.
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p>No proof approval requests have been recorded for this project.</p>
        )}
      </section>

      {/* PROJECT CONVERSATION */}
      <ProjectMessages projectId={id} />

      {/* PROJECT INVOICES */}
      <section className="panel space-y-4">
        <h2>Project Invoices</h2>

        {invoices?.length ? (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="border-b py-3"
              >
                <p className="font-semibold">
                  {invoice.description ||
                    'Publishing Service'}
                </p>

                <p>
                  {invoice.currency}{' '}
                  {(
                    invoice.amount_cents / 100
                  ).toFixed(2)}
                </p>

                <p className="text-sm">
                  Status: {format(invoice.status)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>
            No invoices are associated with this project.
          </p>
        )}
      </section>
    </main>
  );
}
