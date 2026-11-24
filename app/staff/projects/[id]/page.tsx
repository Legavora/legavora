
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

export default async function StaffProjectPage({
  params,
  searchParams,
}: PageProps & {
  searchParams: Promise<{
    document_error?: string;
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

      <section className="panel mt-10">
        <h2 className="heading text-2xl">
          Publishing Workflow
        </h2>

        <p className="text-slate-600 mt-4">
          This workspace is restricted to publishing
          projects assigned to your Legavora staff
          account. Authorized project documents are
          available through the secure document library.
          Editorial submissions, deliverable uploads,
          task completion, and project communication
          will be introduced in subsequent stages.
        </p>
      </section>
    </main>
  );
}
