
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

type ReviewRecord = {
  id: string;
  file_id: string;
  reviewer_id: string;
  decision: string;
  review_notes: string;
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

export default async function AdminProjectDetails({
  params,
}: Props) {
  const { id } = await params;
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(
      'Unable to verify administrator access'
    );
  }

  if (!['admin', 'manager'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const { data: project, error: projectError } = await db
    .from('projects')
    .select(
      'id,title,status,stage,author_id,created_at'
    )
    .eq('id', id)
    .single();

  if (projectError || !project) {
    notFound();
  }

  const { data: author } = await db
    .from('profiles')
    .select('full_name,author_number')
    .eq('id', project.author_id)
    .single();

  const { data: files, error: filesError } = await db
    .from('project_files')
    .select('*')
    .eq('project_id', id)
    .order('created_at', {
      ascending: false,
    });

  const { data: invoices, error: invoicesError } = await db
    .from('invoices')
    .select(
      'id,description,amount_cents,currency,status'
    )
    .eq('project_id', id)
    .order('created_at', {
      ascending: false,
    });

  const { data: reviews, error: reviewsError } = await db
    .from('manuscript_reviews')
    .select(
      'id,file_id,reviewer_id,decision,review_notes,created_at'
    )
    .eq('project_id', id)
    .order('created_at', {
      ascending: false,
    });

  if (filesError || invoicesError || reviewsError) {
    throw new Error(
      'Unable to load project records'
    );
  }

  const reviewHistory: ReviewRecord[] = reviews || [];

  const fileNames = new Map(
    (files || []).map((file) => [
      file.id,
      file.file_name || 'Project file',
    ])
  );

  return (
    <main className="container py-12 space-y-8">
      <Link
        href="/admin"
        className="text-sm underline"
      >
        Back to Administrator Dashboard
      </Link>

      <header className="space-y-3">
        <p className="uppercase tracking-widest text-sm">
          Legavora Publishing Operations
        </p>

        <h1>{project.title}</h1>

        <p>Administrator Project Management</p>
      </header>

      {/* PROJECT OVERVIEW */}
      <section className="panel space-y-4">
        <h2>Project Overview</h2>

        <p>
          <strong>Author:</strong>{' '}
          {author?.full_name || 'Registered Author'}
        </p>

        <p>
          <strong>Author Number:</strong>{' '}
          {author?.author_number
            ? `#${author.author_number}`
            : 'Not assigned'}
        </p>

        <p>
          <strong>Status:</strong>{' '}
          {format(project.status)}
        </p>

        <p>
          <strong>Publishing Stage:</strong>{' '}
          {format(project.stage)}
        </p>

        <p>
          <strong>Created:</strong>{' '}
          {formatDate(project.created_at)}
        </p>
      </section>

      {/* PROJECT FILES */}
      <section className="panel space-y-4">
        <h2>Project Files</h2>

        <p className="text-sm text-slate-600">
          Review and download files submitted for this
          publishing project. Access is restricted to
          authorized Legavora staff.
        </p>

        {files?.length ? (
          <div className="space-y-4">
            {files.map((file) => {
              const fileName =
                file.file_name ||
                file.filename ||
                'Project file';

              const downloadUrl =
                `/api/files/download?id=${encodeURIComponent(
                  file.id
                )}`;

              const fileReviews = reviewHistory.filter(
                (review) => review.file_id === file.id
              );

              const latestReview = fileReviews[0];

              return (
                <div
                  key={file.id}
                  className="border-b py-4 space-y-3"
                >
                  <p className="font-semibold">
                    {fileName}
                  </p>

                  <p className="text-sm text-slate-600">
                    Uploaded:{' '}
                    {formatDate(file.created_at)}
                  </p>

                  {file.version_number != null && (
                    <p className="text-sm">
                      <strong>Version:</strong>{' '}
                      {file.version_number}
                    </p>
                  )}

                  {file.file_category && (
                    <p className="text-sm">
                      <strong>Category:</strong>{' '}
                      {format(file.file_category)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4">
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold underline"
                    >
                      View File
                    </a>

                    <a
                      href={downloadUrl}
                      className="text-sm font-semibold underline"
                    >
                      Download File
                    </a>
                  </div>

                  <div className="rounded-lg border p-4 space-y-2">
                    <h3 className="font-semibold">
                      Editorial Review
                    </h3>

                    {latestReview ? (
                      <>
                        <p className="text-sm">
                          <strong>
                            Latest Decision:
                          </strong>{' '}
                          {format(latestReview.decision)}
                        </p>

                        <p className="text-sm">
                          <strong>Reviewed:</strong>{' '}
                          {formatDate(
                            latestReview.created_at
                          )}
                        </p>

                        <p className="text-sm whitespace-pre-wrap">
                          {latestReview.review_notes}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">
                        This file has not yet received
                        an editorial review.
                      </p>
                    )}

                    <Link
                      href={`/admin/projects/${encodeURIComponent(
                        id
                      )}/reviews/${encodeURIComponent(
                        file.id
                      )}`}
                      className="inline-block text-sm font-semibold underline"
                    >
                      Open Manuscript Review
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p>
            No project files have been uploaded yet.
          </p>
        )}
      </section>

      {/* EDITORIAL REVIEW HISTORY */}
      <section className="panel space-y-4">
        <h2>Editorial Review History</h2>

        <p className="text-sm text-slate-600">
          A record of Legavora's editorial decisions
          and feedback for this publishing project.
        </p>

        {reviewHistory.length ? (
          <div className="space-y-4">
            {reviewHistory.map((review) => (
              <div
                key={review.id}
                className="border-b py-4 space-y-2"
              >
                <p className="font-semibold">
                  {fileNames.get(review.file_id) ||
                    'Project file'}
                </p>

                <p className="text-sm">
                  <strong>Decision:</strong>{' '}
                  {format(review.decision)}
                </p>

                <p className="text-sm">
                  <strong>Date:</strong>{' '}
                  {formatDate(review.created_at)}
                </p>

                <p className="text-sm whitespace-pre-wrap">
                  {review.review_notes}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>
            No editorial reviews have been recorded yet.
          </p>
        )}
      </section>

      {/* PROJECT INVOICES */}
      <section className="panel space-y-4">
        <h2>Project Invoices</h2>

        {invoices?.length ? (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="border-b py-3"
              >
                <p className="font-semibold">
                  {invoice.description ||
                    'Publishing Service'}
                </p>

                <p>
                  {invoice.currency}{' '}
                  {(
                    invoice.amount_cents / 100
                  ).toFixed(2)}
                </p>

                <p className="text-sm">
                  Status: {format(invoice.status)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>
            No invoices are associated with this project.
          </p>
        )}
      </section>
    </main>
  );
}
