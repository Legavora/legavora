
import { currentUser } from '@/lib/supabase';
import { redirect, notFound } from 'next/navigation';
import ProjectActions from '@/components/ProjectActions';
import ApprovalButton from '@/components/ApprovalButton';

export const dynamic = 'force-dynamic';

const publishingStages = [
  {
    key: 'assessment',
    label: 'Manuscript Assessment',
    description:
      'Legavora is reviewing your manuscript, publishing requirements, and project goals.',
  },
  {
    key: 'agreement',
    label: 'Publishing Agreement',
    description:
      'Your publishing agreement and project requirements are being prepared or reviewed.',
  },
  {
    key: 'editing',
    label: 'Editing & Proofreading',
    description:
      'Your manuscript is progressing through editorial review and corrections.',
  },
  {
    key: 'cover_design',
    label: 'Cover Design',
    description:
      'Your book cover is progressing through the design process.',
  },
  {
    key: 'formatting',
    label: 'Book Formatting',
    description:
      'Your manuscript is being prepared for the required publishing formats.',
  },
  {
    key: 'proof_approval',
    label: 'Proof Review & Approval',
    description:
      'Your publishing proofs are being prepared or reviewed for approval.',
  },
  {
    key: 'distribution',
    label: 'Publishing & Distribution',
    description:
      'Your book is progressing through publishing and distribution.',
  },
  {
    key: 'published',
    label: 'Published',
    description:
      'Your book has reached the published stage.',
  },
  {
    key: 'completed',
    label: 'Project Completed',
    description:
      'Your publishing project has reached its final workflow stage.',
  },
];

function formatLabel(value: string | null | undefined) {
  if (!value) return 'Not specified';

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'author') {
    redirect('/dashboard');
  }

  const { data: project } = await db
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('author_id', user.id)
    .single();

  if (!project) notFound();

  const [
    { data: files },
    { data: approvals },
    { data: distribution },
  ] = await Promise.all([
    db
      .from('project_files')
      .select('id,file_name,created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),

    db
      .from('approvals')
      .select('id,label,status,created_at')
      .eq('project_id', id),

    db
      .from('distribution_records')
      .select('platform,status,retailer_url')
      .eq('project_id', id),
  ]);

  const stageIndex = publishingStages.findIndex(
    (stage) => stage.key === project.stage
  );

  const currentStage =
    stageIndex >= 0 ? publishingStages[stageIndex] : null;

  const progress =
    stageIndex >= 0
      ? Math.round(
          ((stageIndex + 1) / publishingStages.length) * 100
        )
      : 0;

  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <p className="eyebrow">PUBLISHING PROJECT</p>

      <h1 className="heading text-4xl mt-3">
        {project.title}
      </h1>

      <p className="text-slate-600 mt-4">
        {project.genre} · {formatLabel(project.service)}
      </p>

      <div className="panel mt-8">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">
              Your Publishing Progress
            </h2>

            <p className="text-slate-600 mt-2">
              {currentStage?.label ??
                formatLabel(project.stage)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-2xl font-semibold">
              {progress}%
            </p>

            <p className="text-sm text-slate-500">
              {stageIndex >= 0
                ? `Stage ${stageIndex + 1} of ${publishingStages.length}`
                : 'Stage pending'}
            </p>
          </div>
        </div>

        <div
          className="w-full h-3 rounded-full bg-slate-200 mt-5 overflow-hidden"
          role="progressbar"
          aria-label="Publishing workflow stage"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[#cba45b]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-5 text-slate-700">
          {currentStage?.description ??
            'Your publishing project is being managed by Legavora.'}
        </p>

        <p className="text-sm text-slate-500 mt-4">
          This indicator represents your current publishing
          workflow stage, not the percentage of work completed.
        </p>

        <div className="border-t mt-6 pt-5">
          <p className="text-sm text-slate-500">
            Project Status
          </p>

          <p className="font-semibold mt-1">
            {formatLabel(project.status)}
          </p>

          <p className="text-sm text-slate-500 mt-4">
            Publishing stages and project status are managed
            exclusively by Legavora.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="panel">
          <h2 className="font-serif text-2xl">
            Project Details
          </h2>

          <p className="text-sm text-slate-500 mt-4">
            Service
          </p>

          <p>{formatLabel(project.service)}</p>

          <p className="text-sm text-slate-500 mt-4">
            Genre
          </p>

          <p>{project.genre || 'Not specified'}</p>

          <p className="text-sm text-slate-500 mt-4">
            Project Description
          </p>

          <p className="mt-2 text-slate-700 whitespace-pre-wrap">
            {project.description ||
              'No description provided.'}
          </p>
        </div>

        <div className="panel">
          <h2 className="font-serif text-2xl">
            Your Submitted Files
          </h2>

          {files?.length ? (
            <div className="mt-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="border-b py-3"
                >
                  <p className="text-sm font-medium break-all">
                    {file.file_name}
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    Submitted to Legavora
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 mt-4">
              No files submitted yet.
            </p>
          )}

          <p className="text-sm text-slate-600 mt-5">
            Your documents are securely managed by Legavora.
            Revised and approved files will be delivered
            to you through email.
          </p>
        </div>
      </div>

      <ProjectActions projectId={id} />

      <h2 className="heading text-3xl mt-12">
        Proof Approvals
      </h2>

      <div className="grid gap-3 mt-4">
        {approvals?.length ? (
          approvals.map((approval) => (
            <div
              className="panel flex items-center justify-between gap-4"
              key={approval.id}
            >
              <div>
                <p className="font-semibold">
                  {approval.label}
                </p>

                <p className="text-sm text-slate-500 mt-1">
                  {formatLabel(approval.status)}
                </p>
              </div>

              {approval.status === 'pending' && (
                <ApprovalButton id={approval.id} />
              )}
            </div>
          ))
        ) : (
          <div className="panel">
            No proofs are awaiting approval.
          </div>
        )}
      </div>

      <h2 className="heading text-3xl mt-12">
        Distribution Tracking
      </h2>

      <div className="grid gap-3 mt-4">
        {distribution?.length ? (
          distribution.map((record, index) => (
            <div
              className="panel flex justify-between flex-wrap gap-4"
              key={index}
            >
              <div>
                <p className="font-semibold">
                  {record.platform}
                </p>

                <p className="text-sm text-slate-500 mt-1">
                  {formatLabel(record.status)}
                </p>
              </div>

              {record.retailer_url &&
                /^https:\/\//.test(record.retailer_url) && (
                  <a
                    href={record.retailer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-[#a67c36]"
                  >
                    View Retailer Listing
                  </a>
                )}
            </div>
          ))
        ) : (
          <div className="panel">
            Distribution information will appear here
            when your project reaches the relevant
            publishing stage.
          </div>
        )}
      </div>
    </div>
  );
}
