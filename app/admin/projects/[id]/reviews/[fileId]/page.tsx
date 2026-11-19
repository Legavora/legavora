
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';
import ManuscriptReviewForm from '@/components/ManuscriptReviewForm';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{
    id: string;
    fileId: string;
  }>;
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

export default async function ManuscriptReviewPage({
  params,
}: Props) {
  const { id, fileId } = await params;

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
    redirect('/dashboard');
  }

  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id,title,author_id')
    .eq('id', id)
    .single();

  if (projectError || !project) {
    notFound();
  }

  const { data: file, error: fileError } = await db
    .from('project_files')
    .select(
      'id,project_id,file_name,file_category,version_number,created_at'
    )
    .eq('id', fileId)
    .eq('project_id', id)
    .single();

  if (fileError || !file) {
    notFound();
  }

  const { data: reviews, error: reviewsError } = await db
    .from('manuscript_reviews')
    .select(
      'id,decision,review_notes,reviewer_id,created_at'
    )
    .eq('project_id', id)
    .eq('file_id', fileId)
    .order('created_at', {
      ascending: false,
    });

  if (reviewsError) {
    throw new Error(
      'Unable to load manuscript review history.'
    );
  }

  const downloadUrl =
    `/api/files/download?id=${encodeURIComponent(file.id)}`;

  return (
    <main className="container py-12 space-y-8">
      <Link
        href={`/admin/projects/${encodeURIComponent(id)}`}
        className="text-sm underline"
      >
        Back to Project Details
      </Link>

      <header className="space-y-3">
        <p className="uppercase tracking-widest text-sm">
          Legavora Publishing Operations
        </p>

        <h1>Manuscript Review</h1>

        <p>{project.title}</p>
      </header>

      <section className="panel space-y-4">
        <h2>Document Information</h2>

        <p>
          <strong>File:</strong> {file.file_name}
        </p>

        <p>
          <strong>Category:</strong>{' '}
          {format(file.file_category)}
        </p>

        <p>
          <strong>Version:</strong>{' '}
          {file.version_number}
        </p>

        <p>
          <strong>Uploaded:</strong>{' '}
          {formatDate(file.created_at)}
        </p>

        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-semibold underline"
        >
          View Submitted Document
        </a>
      </section>

      <section className="panel space-y-4">
        <h2>Record Editorial Decision</h2>

        <p className="text-sm text-slate-600">
          Evaluate this document and record your decision.
          All decisions are preserved in the review history.
        </p>

        <ManuscriptReviewForm
          projectId={project.id}
          fileId={file.id}
        />
      </section>

      <section className="panel space-y-4">
        <h2>Previous Editorial Reviews</h2>

        {reviews?.length ? (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="border-b py-4 space-y-2"
              >
                <p>
                  <strong>Decision:</strong>{' '}
                  {format(review.decision)}
                </p>

                <p>
                  <strong>Date:</strong>{' '}
                  {formatDate(review.created_at)}
                </p>

                <p className="whitespace-pre-wrap">
                  {review.review_notes}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>
            No editorial reviews have been recorded
            for this document.
          </p>
        )}
      </section>
    </main>
  );
}
