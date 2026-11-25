
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
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

type ProjectFile = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  version_number: number;
  file_category: string;
};

const DOCUMENT_ROLES = [
  'project_manager',
  'editor',
  'proofreader',
  'formatter',
  'publishing_specialist',
];

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

function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Unknown size';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function downloadProjectFile(
  projectId: string,
  fileId: string
) {
  'use server';

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
    !['manager', 'specialist'].includes(profile.role)
  ) {
    notFound();
  }

  const { data: assignments, error: assignmentError } =
    await db
      .from('project_assignments')
      .select('assignment_role')
      .eq('project_id', projectId)
      .eq('staff_id', user.id)
      .eq('status', 'active');

  if (
    assignmentError ||
    !assignments ||
    assignments.length === 0
  ) {
    notFound();
  }

  if (
    profile.role === 'specialist' &&
    !assignments.some((assignment) =>
      DOCUMENT_ROLES.includes(assignment.assignment_role)
    )
  ) {
    notFound();
  }

  const { data: file, error: fileError } = await db
    .from('project_files')
    .select('id,file_name,storage_path,file_category')
    .eq('id', fileId)
    .eq('project_id', projectId)
    .in('file_category', ['manuscript', 'proof'])
    .single();

  if (fileError || !file) {
    notFound();
  }

  const { data, error } = await db.storage
    .from('manuscripts')
    .createSignedUrl(file.storage_path, 60, {
      download: file.file_name,
    });

  if (error || !data?.signedUrl) {
    redirect(
      `/staff/projects/${encodeURIComponent(projectId)}?document_error=download`
    );
  }

  redirect(data.signedUrl);
}

const REVIEW_ROLES = ['editor', 'proofreader'];
const REVIEW_DECISIONS = ['approved', 'revision_requested', 'rejected'];

async function submitManuscriptReview(projectId: string, formData: FormData) {
  'use server';
  const { db, user } = await currentUser();
  if (!user) redirect('/login');
  const path = `/staff/projects/${encodeURIComponent(projectId)}`;
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'specialist') notFound();
  const { data: assignments, error: assignmentError } = await db
    .from('project_assignments').select('id')
    .eq('project_id', projectId).eq('staff_id', user.id)
    .eq('status', 'active').in('assignment_role', REVIEW_ROLES).limit(1);
  if (assignmentError || !assignments?.length) notFound();
  const fileId = formData.get('file_id');
  const decision = formData.get('decision');
  const rawNotes = formData.get('review_notes');
  const notes = typeof rawNotes === 'string' ? rawNotes.trim() : '';
  if (typeof fileId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId) ||
      typeof decision !== 'string' || !REVIEW_DECISIONS.includes(decision) || !notes || notes.length > 5000) {
    redirect(`${path}?review_error=invalid#manuscript-reviews`);
  }
  const { data: file, error: fileError } = await db.from('project_files').select('id')
    .eq('id', fileId).eq('project_id', projectId).eq('file_category', 'manuscript').single();
  if (fileError || !file) notFound();
  const { error } = await db.from('manuscript_reviews').insert({
    project_id: projectId, file_id: fileId, reviewer_id: user.id,
    decision, review_notes: notes, visibility: 'internal',
  });
  if (error) redirect(`${path}?review_error=save#manuscript-reviews`);
  revalidatePath(path);
  redirect(`${path}?review_saved=1#manuscript-reviews`);
}

type ManuscriptReview = {
  id: string;
  file_id: string;
  decision: string;
  review_notes: string;
  created_at: string;
};

export default async function StaffProjectPage({
  params,
  searchParams,
}: PageProps & {
  searchParams: Promise<{
    document_error?: string;
    review_error?: string;
    review_saved?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const query = await searchParams;

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
    notFound();
  }

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
    throw new Error(
      'Unable to verify your project assignments.'
    );
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
    profile.full_name?.trim() ||
    user.email ||
    'Team Member';

  const canAccessDocuments =
    profile.role === 'manager' ||
    assignments.some((assignment) =>
      DOCUMENT_ROLES.includes(assignment.assignment_role)
    );

  let files: ProjectFile[] = [];
  let documentsUnavailable = false;

  if (canAccessDocuments) {
    const { data: fileRows, error: filesError } = await db
      .from('project_files')
      .select(
        'id,file_name,storage_path,size_bytes,created_at,version_number,file_category'
      )
      .eq('project_id', projectId)
      .in('file_category', ['manuscript', 'proof'])
      .order('created_at', { ascending: false });

    if (filesError) {
      documentsUnavailable = true;
    } else {
      files = (fileRows || []) as ProjectFile[];
    }
  }

  const manuscripts = files.filter(
    (file) => file.file_category === 'manuscript'
  );

  const proofs = files.filter(
    (file) => file.file_category === 'proof'
  );

  const canReview = profile.role === 'specialist' && assignments.some(
    (assignment) => REVIEW_ROLES.includes(assignment.assignment_role)
  );
  let reviews: ManuscriptReview[] = [];
  let reviewsUnavailable = false;
  if (canReview) {
    const { data, error } = await db.from('manuscript_reviews')
      .select('id,file_id,decision,review_notes,created_at')
      .eq('project_id', projectId).eq('reviewer_id', user.id)
      .order('created_at', { ascending: false });
    reviewsUnavailable = Boolean(error);
    if (!error) reviews = (data || []) as ManuscriptReview[];
  }

  const documentGroups = [
    {
      title: 'Manuscripts',
      description:
        'Original and revised manuscript documents available for your assigned publishing work.',
      files: manuscripts,
    },
    {
      title: 'Proofs',
      description:
        'Publishing proofs and production documents available for review.',
      files: proofs,
    },
  ];

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
        <p className="eyebrow">
          LEGAVORA TEAM WORKSPACE
        </p>

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
          <h2 className="font-semibold">
            Project Status
          </h2>

          <p className="text-xl mt-3">
            {readable(project.status)}
          </p>
        </div>

        <div className="panel">
          <h2 className="font-semibold">
            Production Stage
          </h2>

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
            <p className="font-semibold">
              Publishing Service
            </p>

            <p className="text-slate-600 mt-1">
              {readable(project.service)}
            </p>
          </div>

          <div>
            <p className="font-semibold">
              Genre
            </p>

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
        <p className="eyebrow">
          YOUR ASSIGNED WORK
        </p>

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

      <section className="mt-12">
        <p className="eyebrow">
          SECURE PUBLISHING RESOURCES
        </p>

        <h2 className="heading text-3xl mt-2">
          Project Document Library
        </h2>

        <p className="text-slate-600 mt-3">
          Access publishing documents authorized for
          your active project responsibilities.
        </p>

        {query.document_error === 'download' && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4 mt-5 text-sm"
          >
            Unable to download this document.
            Please try again or contact your
            Legavora administrator.
          </div>
        )}

        {!canAccessDocuments ? (
          <div className="panel mt-5">
            <h3 className="font-semibold">
              Document Access Restricted
            </h3>

            <p className="text-slate-600 mt-2">
              Your current project responsibilities
              do not include access to manuscripts
              or publishing proofs.
            </p>
          </div>
        ) : documentsUnavailable ? (
          <div className="panel mt-5">
            <h3 className="font-semibold">
              Documents Temporarily Unavailable
            </h3>

            <p className="text-slate-600 mt-2">
              Please refresh this page or contact
              your Legavora administrator.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
              <div className="panel">
                <h3 className="font-semibold">
                  Available Documents
                </h3>

                <p className="font-serif text-4xl mt-3">
                  {files.length}
                </p>
              </div>

              <div className="panel">
                <h3 className="font-semibold">
                  Manuscripts
                </h3>

                <p className="font-serif text-4xl mt-3">
                  {manuscripts.length}
                </p>
              </div>

              <div className="panel">
                <h3 className="font-semibold">
                  Publishing Proofs
                </h3>

                <p className="font-serif text-4xl mt-3">
                  {proofs.length}
                </p>
              </div>
            </div>

            {documentGroups.map((group) => (
              <section
                key={group.title}
                className="panel mt-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="heading text-2xl">
                    {group.title}
                  </h3>

                  <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                    {group.files.length} documents
                  </span>
                </div>

                <p className="text-sm text-slate-600 mt-3">
                  {group.description}
                </p>

                {group.files.length === 0 ? (
                  <div className="border rounded-lg p-5 mt-5">
                    <p className="text-sm text-slate-600">
                      No authorized documents are
                      currently available in this category.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 mt-6">
                    {group.files.map((file) => (
                      <article
                        key={file.id}
                        className="border rounded-lg p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs uppercase tracking-wider text-slate-500">
                              {readable(file.file_category)}
                            </p>

                            <h4 className="font-semibold mt-2 break-all">
                              {file.file_name}
                            </h4>

                            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-sm text-slate-600">
                              <span>
                                Version {file.version_number}
                              </span>

                              <span>
                                {fileSize(file.size_bytes)}
                              </span>

                              <span>
                                Uploaded: {dateLabel(file.created_at)}
                              </span>
                            </div>
                          </div>

                          <form
                            action={downloadProjectFile.bind(
                              null,
                              projectId,
                              file.id
                            )}
                          >
                            <button
                              type="submit"
                              className="rounded-lg bg-[#0d1928] text-white px-5 py-3 text-sm font-semibold hover:opacity-90"
                            >
                              Download Document
                            </button>
                          </form>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </>
        )}

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 mt-6">
          <h3 className="font-semibold text-sm">
            Confidential Publishing Materials
          </h3>

          <p className="text-sm text-slate-700 mt-2">
            Documents in this workspace are confidential
            and intended exclusively for authorized
            publishing responsibilities. Do not distribute,
            reproduce, or share these materials outside
            your approved Legavora workflow.
          </p>
        </div>
      </section>

      {canReview && (
        <section id="manuscript-reviews" className="mt-12 scroll-mt-6">
          <p className="eyebrow">EDITORIAL WORKSPACE</p>
          <h2 className="heading text-3xl mt-2">Manuscript Review Centre</h2>
          <p className="text-slate-600 mt-3">Submit internal editorial feedback for your assigned project. Your decision is a recommendation, not final author approval.</p>
          {query.review_saved === '1' && <p role="status" className="border border-green-200 bg-green-50 text-green-800 rounded-lg p-4 mt-5">Review submitted successfully.</p>}
          {query.review_error && <p role="alert" className="border border-red-200 bg-red-50 text-red-700 rounded-lg p-4 mt-5">{query.review_error === 'invalid' ? 'Please select a manuscript, decision and valid review notes.' : 'Unable to save your review. Please try again or contact your administrator.'}</p>}
          <div className="panel mt-6">
            <h3 className="heading text-2xl">Submit a Manuscript Review</h3>
            {documentsUnavailable || manuscripts.length === 0 ? (
              <p className="text-slate-600 mt-4">No manuscripts are currently available for review.</p>
            ) : (
              <form action={submitManuscriptReview.bind(null, projectId)} className="space-y-5 mt-5">
                <div>
                  <label htmlFor="review-file" className="block font-semibold text-sm mb-2">Manuscript and version</label>
                  <select id="review-file" name="file_id" required defaultValue="" className="w-full border rounded-lg p-3 bg-white">
                    <option value="" disabled>Select a manuscript</option>
                    {manuscripts.map((file) => <option key={file.id} value={file.id}>{file.file_name} — Version {file.version_number}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="review-decision" className="block font-semibold text-sm mb-2">Editorial decision</label>
                  <select id="review-decision" name="decision" required defaultValue="" className="w-full border rounded-lg p-3 bg-white">
                    <option value="" disabled>Select a decision</option>
                    {REVIEW_DECISIONS.map((decision) => <option key={decision} value={decision}>{readable(decision)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="review-notes" className="block font-semibold text-sm mb-2">Review notes</label>
                  <textarea id="review-notes" name="review_notes" required maxLength={5000} rows={7} className="w-full border rounded-lg p-3" placeholder="Describe your findings, recommended corrections and next steps." />
                </div>
                <p className="text-sm text-slate-600">Visibility: Internal only. This submission does not change the project stage or publish feedback to the author.</p>
                <button type="submit" className="rounded-lg bg-[#0d1928] text-white px-5 py-3 text-sm font-semibold hover:opacity-90">Submit Internal Review</button>
              </form>
            )}
          </div>
          <div className="panel mt-6">
            <h3 className="heading text-2xl">My Review History</h3>
            {reviewsUnavailable ? <p className="mt-4 text-slate-600">Review history is temporarily unavailable.</p> : reviews.length === 0 ? <p className="mt-4 text-slate-600">You have not submitted any reviews for this project.</p> : (
              <div className="space-y-4 mt-5">
                {reviews.map((review) => (
                  <article key={review.id} className="border rounded-lg p-5 space-y-3">
                    <h4 className="font-semibold break-all">{manuscripts.find((file) => file.id === review.file_id)?.file_name || 'Manuscript'}</h4>
                    <p className="text-sm text-slate-600">{readable(review.decision)} · {dateLabel(review.created_at)}{manuscripts.find((file) => file.id === review.file_id) ? ` · Version ${manuscripts.find((file) => file.id === review.file_id)?.version_number}` : ''}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{review.review_notes}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="panel mt-10">
        <h2 className="heading text-2xl">
          Publishing Workflow
        </h2>

        <p className="text-slate-600 mt-4">
          This workspace is restricted to publishing
          projects assigned to your Legavora staff
          account. Authorized project documents are
          available through the secure document library.
          Editorial review submissions are available to eligible
          specialists. Deliverable uploads, task completion,
          and project communication will be introduced in
          subsequent stages.
        </p>
      </section>
    </main>
  );
}
