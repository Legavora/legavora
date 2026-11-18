
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function AuthorsPage() {
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

  const { data: profile, error: roleError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (roleError || !profile || !['admin', 'manager'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const { data: authors, error } = await db
    .from('profiles')
    .select('id,role')
    .eq('role', 'author')
    .order('id', { ascending: true });

  return (
    <main className="max-w-7xl mx-auto px-5 py-16">
      <Link href="/admin" className="text-sm underline">
        Back to Administration
      </Link>

      <p className="eyebrow mt-8">LEGAVORA OPERATIONS</p>

      <h1 className="heading text-4xl mt-3">
        Authors Management
      </h1>

      <p className="text-slate-600 mt-3">
        View registered author accounts on the Legavora platform.
      </p>

      {error ? (
        <div className="panel mt-8">
          <p className="text-red-700">
            Unable to load authors. Check database access permissions.
          </p>
        </div>
      ) : !authors?.length ? (
        <div className="panel mt-8">
          <p>No registered authors found.</p>
        </div>
      ) : (
        <div className="grid gap-4 mt-8">
          {authors.map((author, index) => (
            <div className="panel" key={author.id}>
              <h2 className="font-serif text-xl">
                Author {index + 1}
              </h2>

              <p className="text-sm text-slate-600 mt-2">
                Account ID: {author.id}
              </p>

              <p className="text-sm mt-2">
                Role: {author.role}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
