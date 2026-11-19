
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';
import AdminTools from '@/components/AdminTools';
import AdminRevisionUpload from '@/components/AdminRevisionUpload';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default async function AuthorDetails({
  params,
}: PageProps) {
  const { id } = await params;
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

  // Verify administrator permissions.
  const { data: staff, error: staffError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    staffError ||
    !staff ||
    !['admin', 'manager'].includes(staff.role)
  ) {
    redirect('/dashboard');
  }

  // Retrieve the selected author.
  const { data: author, error: authorError } = await db
    .from('profiles')
    .select('id,full_name,author_number,role,created_at')
    .eq('id', id)
    .eq('role', 'author')
    .maybeSingle();

  if (authorError) {
    throw new Error('Unable to load author profile.');
  }

  if (!author) notFound();

  // Retrieve the author's publishing projects.
  const { data: projects, error: projectsError } = await db
    .from('projects')
    .select(
      'id,title,status,stage,genre,description,created_at'
    )
    .eq('author_id', author.id)
    .order('created_at', { ascending: false });

  if (projectsError) {
    throw new Error('Unable to load publishing projects.');
  }

  const projectList = projects ?? [];
  const projectIds = projectList.map((project) => project.id);

  // Retrieve manuscripts and revision history.
  const { data: files, error: filesError } =
    projectIds.length > 0
      ? await db
          .from('project_files')
          .select('*')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };

  const authorId =
    author.author_number != null
      ? `LG-${author.author_number}`
      : 'Not assigned';

  const activeProjects = projectList.filter((project) =>
    ['in_review', 'in_progress'].includes(project.status)
  ).length;

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <Link
        href="/admin/authors"
        className="text-sm underline"
      >
        Back to Authors Management
      </Link>

      {/* Author heading */}
      <div className="mt-10">
        <p className="eyebrow">LEGAVORA OPERATIONS</p>

        <h1 className="heading text-4xl mt-3">
          {author.full_name || 'Unnamed Author'}
        </h1>

        <p className="text-slate-600 mt-3">
          Individual author account, publishing history
          and project management.
        </p>

        <p className="text-slate-600 mt-3">
          Legavora Author ID: <strong>{authorId}</strong>
        </p>
      </div>

      {/* Author statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10">
        <div className="panel">
          <p className="text-sm text-slate-600">
            Total Publishing Projects
          </p>
          <p className="text-3xl font-semibold mt-3">
            {projectList.length}
          </p>
        </div>

        <div className="panel">
          <p className="text-sm text-slate-600">
            Active Projects
          </p>
          <p className="text-3xl font-semibold mt-3">
            {activeProjects}
          </p>
        </div>
      </div>

      {/* Author information */}
      <section className="panel mt-10">
        <h2 className="heading text-2xl">
          Author Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div>
            <p className="text-sm text-slate-500">
              Full Name
            </p>
            <p className="font-semibold mt-1">
              {author.full_name || 'Not provided'}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Legavora Author ID
            </p>
            <p className="font-semibold mt-1">
              {authorId}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Account Role
            </p>
            <p className="font-semibold mt-1">
              {formatLabel(author.role)}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Registration Date
            </p>
            <p className="font-semibold mt-1">
              {formatDate(author.created_at)}
            </p>
          </div>
        </div>
      </section>

      {/* Publishing projects */}
      <section className="mt-12">
        <h2 className="heading text-3xl">
          Publishing Projects ({projectList.length})
        </h2>

        {projectList.length === 0 ? (
          <div className="panel mt-6">
            <p className="text-slate-600">
              This author has not submitted any publishing
              projects yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 mt-6">
            {projectList.map((project) => {
              const projectFiles = (files ?? []).filter(
                (file) => file.project_id === project.id
              );

              return (
                <article className="panel" key={project.id}>
                  {/* Project heading */}
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <h3 className="font-serif text-2xl">
                        {project.title}
                      </h3>

                      <p className="text-sm text-slate-500 mt-2">
                        Submitted{' '}
                        {formatDate(project.created_at)}
                      </p>
                    </div>

                    <span className="rounded-full border px-4 py-2 text-sm">
                      {formatLabel(project.status)}
                    </span>
                  </div>

                  {/* Project details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
                    <div>
                      <p className="text-sm text-slate-500">
                        Project Status
                      </p>
                      <p className="font-medium mt-1">
                        {formatLabel(project.status)}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500">
                        Publishing Stage
                      </p>
                      <p className="font-medium mt-1">
                        {formatLabel(project.stage)}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500">
                        Genre
                      </p>
                      <p className="font-medium mt-1">
                        {project.genre || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500">
                        Submission Date
                      </p>
                      <p className="font-medium mt-1">
                        {formatDate(project.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Project description */}
                  {project.description && (
                    <div className="mt-7">
                      <p className="text-sm text-slate-500">
                        Project Description
                      </p>
                      <p className="text-slate-700 mt-2 whitespace-pre-wrap">
                        {project.description}
                      </p>
                    </div>
                  )}

                  {/* Project management */}
                  <div className="border-t mt-8 pt-7">
                    <h4 className="font-semibold text-xl">
                      Project Management
                    </h4>

                    <p className="text-slate-600 mt-2 mb-5">
                      Change the publishing stage or project
                      status, then select Update to save.
                    </p>

                    <AdminTools
                      projectId={project.id}
                      currentStage={project.stage}
                      currentStatus={project.status}
                    />
                  </div>

                  {/* Manuscript management */}
                  <div className="border-t mt-8 pt-7">
                    <h4 className="font-semibold text-xl">
                      Manuscripts &amp; Project Files (
                      {projectFiles.length})
                    </h4>

                    {filesError ? (
                      <p className="text-red-700 mt-4">
                        Unable to load project files.
                        Check file access permissions.
                      </p>
                    ) : projectFiles.length === 0 ? (
                      <p className="text-slate-600 mt-4">
                        No uploaded files found for this project.
                      </p>
                    ) : (
                      <div className="grid gap-3 mt-5">
                        {projectFiles.map((file) => {
                          const fileName =
                            file.file_name ??
                            'Project document';

                          return (
                            <div
                              key={file.id}
                              className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-4"
                            >
                              <div>
                                <p className="font-medium break-all">
                                  {fileName}
                                </p>

                                {file.created_at && (
                                  <p className="text-sm text-slate-500 mt-1">
                                    Uploaded{' '}
                                    {formatDate(file.created_at)}
                                  </p>
                                )}

                                <p className="text-sm text-slate-500 mt-1">
                                  Version{' '}
                                  {file.version_number ?? 1}
                                </p>

                                {file.revision_notes && (
                                  <p className="text-sm text-slate-600 mt-2">
                                    Revision notes:{' '}
                                    {file.revision_notes}
                                  </p>
                                )}
                              </div>

                              {/* Administrator-only download */}
                              <a
                                href={`/api/files/download?id=${encodeURIComponent(file.id)}`}
                                className="text-sm font-semibold text-[#a67c36] underline shrink-0"
                              >
                                Download File
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Administrator revision upload */}
                    {!filesError && (
                      <AdminRevisionUpload
                        projectId={project.id}
                        existingFiles={projectFiles.map(
                          (file) => ({
                            id: file.id,
                            file_name: file.file_name,
                            version_number:
                              file.version_number ?? 1,
                          })
                        )}
                      />
                    )}
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
