
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';
import AdminTools from '@/components/AdminTools';

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
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function AuthorDetails({
  params,
}: PageProps) {
  const { id } = await params;
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

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

  const { data: projects, error: projectsError } = await db
    .from('projects')
    .select(
      'id,title,status,stage,genre,description,created_at'
    )
    .eq('author_id', author.id)
    .order('created_at', { ascending: false });

  const authorId =
    author.author_number != null
      ? `LG-${author.author_number}`
      : 'Not assigned';

  const projectCount = projectsError
    ? 'Unavailable'
    : projects?.length ?? 0;

  const activeProjects = (projects ?? []).filter(
    (project) =>
      ['in_review', 'in_progress'].includes(project.status)
  ).length;

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <div className="flex flex-wrap gap-5">
        <Link
          href="/admin/authors"
          className="text-sm underline"
        >
          Back to Authors Management
        </Link>

        <Link href="/admin" className="text-sm underline">
          Administration Dashboard
        </Link>
      </div>

      <header className="mt-10">
        <p className="eyebrow">LEGAVORA OPERATIONS</p>

        <h1 className="heading text-4xl mt-3">
          {author.full_name || 'Unnamed Author'}
        </h1>

        <p className="text-slate-600 mt-3">
          Individual author account, publishing history
          and project management.
        </p>

        <p className="text-sm text-slate-600 mt-3">
          Legavora Author ID:{' '}
          <strong>{authorId}</strong>
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
        <div className="panel">
          <p className="text-sm text-slate-600">
            Total Publishing Projects
          </p>
          <p className="text-3xl font-semibold mt-3">
            {projectCount}
          </p>
        </div>

        <div className="panel">
          <p className="text-sm text-slate-600">
            Active Projects
          </p>
          <p className="text-3xl font-semibold mt-3">
            {projectsError ? 'Unavailable' : activeProjects}
          </p>
        </div>
      </section>

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

      <section className="mt-12">
        <h2 className="heading text-3xl">
          Publishing Projects
        </h2>

        <p className="text-slate-600 mt-3">
          Review the author's submitted books and manage
          their publishing progress.
        </p>

        {projectsError ? (
          <div className="panel mt-6">
            <p className="text-red-700">
              Unable to load publishing projects.
            </p>
          </div>
        ) : !projects?.length ? (
          <div className="panel mt-6">
            <p className="text-slate-600">
              This author has not submitted any publishing
              projects yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 mt-6">
            {projects.map((project) => (
              <article className="panel" key={project.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-2xl">
                      {project.title}
                    </h3>

                    <p className="text-sm text-slate-500 mt-2">
                      Submitted {formatDate(project.created_at)}
                    </p>
                  </div>

                  <span className="rounded-full border px-4 py-2 text-sm">
                    {formatLabel(project.status)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-7">
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

                <div className="border-t mt-8 pt-7">
                  <h4 className="font-semibold text-lg">
                    Project Management
                  </h4>

                  <p className="text-sm text-slate-600 mt-2">
                    Change the publishing stage or project
                    status, then select Update to save.
                  </p>

                  <div className="mt-4">
                    <AdminTools
                      projectId={project.id}
                      currentStage={project.stage}
                      currentStatus={project.status}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
