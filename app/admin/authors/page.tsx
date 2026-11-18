
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type SearchParams = {
  q?: string | string[];
};

export default async function AuthorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (
    !profile ||
    !['admin', 'manager'].includes(profile.role)
  ) {
    redirect('/dashboard');
  }

  const [
    { data: authors, error: authorsError },
    { data: projects, error: projectsError },
  ] = await Promise.all([
    db
      .from('profiles')
      .select('id,full_name,role,created_at')
      .eq('role', 'author')
      .order('full_name', { ascending: true }),

    db
      .from('projects')
      .select('id,author_id,title,status,stage')
      .order('created_at', { ascending: false }),
  ]);

  const params = await searchParams;
  const rawQuery = params.q;
  const query = (
    Array.isArray(rawQuery)
      ? rawQuery[0] ?? ''
      : rawQuery ?? ''
  ).trim().toLowerCase();

  const authorRecords = (authors ?? []).map((author) => {
    const authorProjects = (projects ?? []).filter(
      (project) => project.author_id === author.id
    );

    return {
      ...author,
      projects: authorProjects,
    };
  });

  const filteredAuthors = authorRecords.filter((author) => {
    if (!query) return true;

    const nameMatch = (author.full_name ?? '')
      .toLowerCase()
      .includes(query);

    const idMatch = author.id
      .toLowerCase()
      .includes(query);

    const bookMatch = author.projects.some(
      (project) =>
        (project.title ?? '')
          .toLowerCase()
          .includes(query)
    );

    return nameMatch || idMatch || bookMatch;
  });

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <Link href="/admin" className="text-sm underline">
        Back to Administration
      </Link>

      <p className="eyebrow mt-8">
        LEGAVORA OPERATIONS
      </p>

      <h1 className="heading text-4xl mt-3">
        Authors Management
      </h1>

      <p className="text-slate-600 mt-3">
        Manage registered authors and view their
        publishing projects.
      </p>

      <form
        action="/admin/authors"
        method="GET"
        className="flex flex-wrap gap-3 mt-8"
        role="search"
      >
        <input
          type="search"
          name="q"
          aria-label="Search authors"
          placeholder="Search name, book title or account ID"
          defaultValue={query}
          className="border rounded-lg px-4 py-3 flex-1 min-w-60 bg-white"
        />

        <button type="submit" className="btn">
          Search
        </button>

        {query && (
          <Link
            href="/admin/authors"
            className="border rounded-lg px-5 py-3"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-8">
        <p className="text-sm text-slate-600">
          {filteredAuthors.length} author account(s) found
        </p>
      </div>

      {authorsError || projectsError ? (
        <div className="panel mt-6">
          <p className="text-red-700">
            Unable to load complete author information.
            Please check database permissions.
          </p>
        </div>
      ) : filteredAuthors.length === 0 ? (
        <div className="panel mt-6">
          <p>No matching authors found.</p>
        </div>
      ) : (
        <div className="grid gap-5 mt-6">
          {filteredAuthors.map((author) => (
            <article className="panel" key={author.id}>
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl">
                    {author.full_name || 'Unnamed Author'}
                  </h2>

                  <p className="text-sm text-slate-600 mt-2">
                    Account ID: {author.id}
                  </p>

                  <p className="text-sm text-slate-600 mt-2">
                    Registered:{' '}
                    {author.created_at
                      ? new Date(
                          author.created_at
                        ).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })
                      : 'Not available'}
                  </p>
                </div>

                <div>
                  <span className="text-sm border rounded-full px-4 py-2">
                    {author.role}
                  </span>
                </div>
              </div>

              <div className="mt-6 border-t pt-5">
                <h3 className="font-semibold text-lg">
                  Publishing Projects
                  {' '}({author.projects.length})
                </h3>

                {author.projects.length === 0 ? (
                  <p className="text-slate-600 mt-3">
                    No publishing projects yet.
                  </p>
                ) : (
                  <div className="grid gap-3 mt-4">
                    {author.projects.map((project) => (
                      <div
                        key={project.id}
                        className="border rounded-lg p-4"
                      >
                        <h4 className="font-serif text-xl">
                          {project.title}
                        </h4>

                        <p className="text-sm text-slate-600 mt-2">
                          Status:{' '}
                          {project.status.replaceAll('_', ' ')}
                        </p>

                        <p className="text-sm text-slate-600 mt-1">
                          Stage:{' '}
                          {project.stage.replaceAll('_', ' ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
