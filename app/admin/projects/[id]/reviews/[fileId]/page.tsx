
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

type ReviewRecord = {
  id: string;
  decision: string;
  review_notes: string;
  reviewer_id: string;
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

function ReviewHistory({
  reviews,
  reviewerNames,
  emptyMessage,
}: {
  reviews: ReviewRecord[];
  reviewerNames: Map<string, string>;
  emptyMessage: string;
}) {
  if (!reviews.length) {
    return (
      <p className="text-sm text-slate-600">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <article
          key={review.id}
          className="rounded-lg border p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">
              {format(review.decision)}
            </h3>

            <span
              className={
                review.visibility === 'internal'
                  ? 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900'
                  : 'rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-900'
              }
            >
              {review.visibility === 'internal'
                ? 'Internal Only'
                : 'Author Visible'}
            </span>
          </div>

          <p className="text-sm">
            <strong>Reviewed by:</strong>{' '}
            {reviewerNames.get(review.reviewer_id) ||
              'Legavora Staff'}
          </p>

          <p className="text-sm text-slate-600">
            {formatDate(review.created_at)}
          </p>

          <div className="rounded-md bg-slate-50 p-4 text-slate-900">
            <p className="text-sm whitespace-pre-wrap break-words">
              {review.review_notes}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function ManuscriptReviewPage({
  params,
}: Props) {
  const { id, fileId } = await params;
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } =
    await db
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

  const { data: project, error: projectError } =
    await db
      .from('projects')
      .select('id,title,author_id')
      .eq('id', id)
      .single();

  if (projectError || !project) {
    notFound();
  }

  const { data: file, error: fileError } =
    await db
      .from('project_files')
      .select(
        'id,project_id,file_name,file_category,version_number,created_at'
      )
      .eq('id', fileId)
      .eq('project_id', id)
      .single();

  if (
    fileError ||
    !file ||
    file.file_category !== 'manuscript'
  ) {
    notFound();
  }

  const { data: reviews, error: reviewsError } =
    await db
      .from('manuscript_reviews')
      .select(
        'id,decision,review_notes,reviewer_id,visibility,created_at'
      )
      .eq('project_id', id)
      .eq('file_id', fileId)
      .order('created_at', { ascending: false });

  if (reviewsError) {
    throw new Error(
      'Unable to load manuscript review history.'
    );
  }

  const reviewHistory: ReviewRecord[] = reviews || [];

  const internalReviews = reviewHistory.filter(
    (review) => review.visibility === 'internal'
  );

  const officialReviews = reviewHistory.filter(
    (review) => review.visibility === 'author_visible'
  );

  const reviewerIds = Array.from(
    new Set(
      reviewHistory.map((review) => review.reviewer_id)
    )
  );

  const reviewerNames = new Map<string, string>();

  if (reviewerIds.length) {
    const { data: reviewers } = await db
      .from('profiles')
      .select('id,full_name')
      .in('id', reviewerIds);

    for (const reviewer of reviewers || []) {
      reviewerNames.set(
        reviewer.id,
        reviewer.full_name || 'Legavora Staff'
      );
    }
  }

  const latestOfficialReview = officialReviews[0];

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

        <h1>Management Editorial Review Centre</h1>

        <p>{project.title}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel space-y-2">
          <p className="text-sm text-slate-600">
            Internal Recommendations
          </p>

          <p className="text-3xl font-bold">
            {internalReviews.length}
          </p>
        </div>

        <div className="panel space-y-2">
          <p className="text-sm text-slate-600">
            Official Decisions
          </p>

          <p className="text-3xl font-bold">
            {officialReviews.length}
          </p>
        </div>

        <div className="panel space-y-2">
          <p className="text-sm text-slate-600">
            Latest Official Decision
          </p>

          <p className="text-lg font-bold">
            {latestOfficialReview
              ? format(latestOfficialReview.decision)
              : 'Awaiting Decision'}
          </p>
        </div>
      </section>

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
          {file.version_number ?? 1}
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
          View Submitted Manuscript
        </a>
      </section>

      <section className="panel space-y-5">
        <h2>Internal Editorial Recommendations</h2>

        <p className="text-sm text-slate-600">
          Review confidential assessments submitted by
          Legavora's editorial team before issuing an
          official decision.
        </p>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          These recommendations are confidential and
          are not visible to the author.
        </div>

        <ReviewHistory
          reviews={internalReviews}
          reviewerNames={reviewerNames}
          emptyMessage="No internal editorial recommendations have been submitted for this manuscript version."
        />
      </section>

      <section className="panel space-y-5">
        <h2>Publish Official Editorial Decision</h2>

        <p className="text-sm text-slate-600">
          Management retains responsibility for the
          official editorial decision. Prepare feedback
          suitable for the author after evaluating the
          manuscript and any internal recommendations.
        </p>

        <ManuscriptReviewForm
          projectId={project.id}
          fileId={file.id}
        />
      </section>

      <section className="panel space-y-5">
        <h2>Official Editorial Decision History</h2>

        <p className="text-sm text-slate-600">
          These decisions and feedback are available
          to the author. Earlier decisions remain
          preserved for accountability.
        </p>

        <ReviewHistory
          reviews={officialReviews}
          reviewerNames={reviewerNames}
          emptyMessage="No official editorial decisions have been published for this manuscript version."
        />
      </section>
    </main>
  );
}
