
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type SearchParams = {
  q?: string | string[];
};

export default async function AuthorsManagement({
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

  const params = await searchParams;

  const query = (
    typeof params.q === 'string' ? params.q : ''
  ).trim().toLowerCase();

  const { data: authors, error: authorsError } =
    await db
      .from('profiles')
      .select(
        'id,full_name,role,created_at,author_number'
      )
      .eq('role', 'author')
      .order('created_at', { ascending: true });

  const { data: projects, error: projectsError } =
    await db
      .from('projects')
      .select(
        'id,author_id,title,status,stage'
      )
      .order('created_at', { ascending: false });

  const authorList = authors ?? [];
  const projectList = projects ?? [];

  const filteredAuthors = authorList.filter((author) => {
    const authorProjects = projectList.filter(
      (project) => project.author_id === author.id
    );

    const authorId =
      author.author_number != null
        ? `LG-${author.author_number}`
        : '';

    return (
      !query ||
      (author.full_name ?? '')
        .toLowerCase()
        .includes(query) ||
      authorId.toLowerCase().includes(query) ||
      authorProjects.some((project) =>
        (project.title ?? '')
          .toLowerCase()
          .includes(query)
      )
    );
  });

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <Link
        href="/admin"
        className="text-sm underline"
      >
        Back to Administration
      </Link>

      <p className="eyebrow mt-10">
        LEGAVORA OPERATIONS
      </p>

      <h1 className="heading text-4xl mt-3">
        Authors Management
      </h1>

      <p className="text-slate-600 mt-3">
        Search registered authors by name,
        publishing project or Legavora Author ID.
      </p>

      <form
        action="/admin/authors"
        method="GET"
        className="flex flex-col sm:flex-row gap-3 mt-8"
      >
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search name, book title or LG-100001"
          aria-label="Search authors"
          className="flex-1 min-w-0"
        />

        <button
          type="submit"
          className="btn"
        >
          Search
        </button>

        {query && (
          <Link
            href="/admin/authors"
            className="inline-flex items-center justify-center px-5 py-3 border rounded-lg"
          >
            Clear
          </Link>
        )}
      </form>

      {authorsError || projectsError ? (
        <div className="panel mt-8">
          <p className="text-red-700">
            Unable to load author records or publishing
            projects. Please check the database connection
            and access permissions.
          </p>
        </div>
      ) : (
        <>
          <p className="text-slate-600 mt-8">
            {filteredAuthors.length} author account(s) found
          </p>

          <div className="grid gap-5 mt-5">
            {filteredAuthors.map((author) => {
              const authorProjects = projectList.filter(
                (project) =>
                  project.author_id === author.id
              );

              const authorId =
                author.author_number != null
                  ? `LG-${author.author_number}`
                  : 'Not assigned';

              return (
                <article
                  className="panel"
                  key={author.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-serif text-2xl">
                        {author.full_name ||
                          'Unnamed Author'}
                      </h2>

                      <p className="text-slate-600 mt-2">
                        Author ID:{' '}
                        <strong className="text-slate-900">
                          {authorId}
                        </strong>
                      </p>

                      <p className="text-sm text-slate-500 mt-2">
                        Registered:{' '}
                        {new Date(
                          author.created_at
                        ).toLocaleDateString(
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

                    <span className="rounded-full border px-4 py-2 text-sm">
                      Author
                    </span>
                  </div>

                  <div className="border-t mt-7 pt-6">
                    <h3 className="font-semibold text-lg">
                      Publishing Projects (
                      {authorProjects.length})
                    </h3>

                    {authorProjects.length === 0 ? (
                      <p className="text-slate-600 mt-3">
                        No publishing projects yet.
                      </p>
                    ) : (
                      <div className="grid gap-3 mt-4">
                        {authorProjects.map(
                          (project) => (
                            <div
                              key={project.id}
                              className="rounded-lg border p-4"
                            >
                              <h4 className="font-serif text-xl">
                                {project.title}
                              </h4>

                              <p className="text-sm text-slate-600 mt-2">
                                Status:{' '}
                                {project.status}
                              </p>

                              <p className="text-sm text-slate-600 mt-1">
                                Stage:{' '}
                                {project.stage}
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {filteredAuthors.length === 0 && (
            <div className="panel mt-5">
              <p className="text-slate-600">
                No authors match your search.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
