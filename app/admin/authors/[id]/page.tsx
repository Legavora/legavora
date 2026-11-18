
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AuthorDetails({ params }: PageProps) {
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
    .select('id,title,status,stage,genre,description,created_at')
    .eq('author_id', author.id)
    .order('created_at', { ascending: false });

  const authorId = author.author_number
    ? `LG-${author.author_number}`
    : 'Not assigned';

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <Link
        href="/admin/authors"
        className="text-sm underline"
      >
        Back to Authors Management
      </Link>

      <div className="mt-10">
        <p className="eyebrow">LEGAVORA OPERATIONS</p>

        <h1 className="heading text-4xl mt-3">
          {author.full_name || 'Unnamed Author'}
        </h1>

        <p className="text-slate-600 mt-3">
          Individual author account and publishing history.
        </p>
      </div>

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
              {author.role}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Registration Date
            </p>
            <p className="font-semibold mt-1">
              {new Date(author.created_at).toLocaleDateString(
                'en-GB',
                {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                }
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="heading text-3xl">
          Publishing Projects ({projects?.length ?? 0})
        </h2>

        {projectsError ? (
          <p className="mt-5 text-red-700">
            Unable to load publishing projects.
          </p>
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
                <h3 className="font-serif text-2xl">
                  {project.title}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                  <div>
                    <p className="text-sm text-slate-500">
                      Project Status
                    </p>
                    <p className="font-medium mt-1">
                      {project.status.replaceAll('_', ' ')}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">
                      Publishing Stage
                    </p>
                    <p className="font-medium mt-1">
                      {project.stage.replaceAll('_', ' ')}
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
                      {new Date(
                        project.created_at
                      ).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </p>
                  </div>
                </div>

                {project.description && (
                  <div className="mt-6">
                    <p className="text-sm text-slate-500">
                      Project Description
                    </p>
                    <p className="text-slate-700 mt-2 whitespace-pre-wrap">
                      {project.description}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
