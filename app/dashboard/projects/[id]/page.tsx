
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

const productionStages = [
  {
    key: 'interior_formatting',
    label: 'Interior Formatting and Layout',
  },
  {
    key: 'cover_design',
    label: 'Cover Design',
  },
  {
    key: 'ebook_conversion',
    label: 'eBook Conversion',
  },
  {
    key: 'proof_preparation',
    label: 'Proof Preparation',
  },
  {
    key: 'quality_assurance',
    label: 'Quality Assurance',
  },
  {
    key: 'distribution_setup',
    label: 'Distribution Setup',
  },
  {
    key: 'publication',
    label: 'Publication',
  },
];

type ProductionTask = {
  id: string;
  task_type: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  updated_at: string;
};

function formatLabel(value: string | null | undefined) {
  if (!value) return 'Not specified';

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not scheduled';

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00Z`
      : value
  );

  if (Number.isNaN(date.getTime())) {
    return 'Not scheduled';
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
    { data: productionTasks, error: productionError },
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

    db
      .from('production_tasks')
      .select(
        'id,task_type,status,due_date,notes,updated_at'
      )
      .eq('project_id', id),
  ]);

  if (productionError) {
    console.error(
      'Unable to load production progress:',
      productionError.message
    );
  }

  const taskMap = new Map<string, ProductionTask>();

  for (const task of (productionTasks || []) as ProductionTask[]) {
    taskMap.set(task.task_type, task);
  }

  const completedProductionStages =
    productionStages.filter((stage) => {
      return taskMap.get(stage.key)?.status === 'completed';
    }).length;

  const productionProgress = Math.round(
    (completedProductionStages / productionStages.length) * 100
  );

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

      {/* READ-ONLY PRODUCTION TRACKER */}
      <section className="panel mt-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">
              Publishing Production Progress
            </h2>

            <p className="text-sm text-slate-600 mt-2">
              Follow the production of your book, including
              formatting, cover design, quality checks,
              and publication preparation.
            </p>
          </div>

          <div className="text-right">
            <p className="text-2xl font-semibold">
              {productionProgress}%
            </p>

            <p className="text-xs text-slate-500">
              {completedProductionStages} of{' '}
              {productionStages.length} stages completed
            </p>
          </div>
        </div>

        <div
          className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Publishing production completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={productionProgress}
        >
          <div
            className="h-full rounded-full bg-[#cba45b]"
            style={{ width: `${productionProgress}%` }}
          />
        </div>

        {productionError && (
          <p className="text-sm text-red-700" role="alert">
            Production updates are temporarily unavailable.
            Please check again later.
          </p>
        )}

        <div className="space-y-4">
          {productionStages.map((stage, index) => {
            const task = taskMap.get(stage.key);
            const status = task?.status || 'not_started';

            return (
              <div
                key={stage.key}
                className="rounded-lg border border-slate-200 p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {index + 1}. {stage.label}
                  </h3>

                  <span className="text-sm font-semibold text-slate-700">
                    {formatLabel(status)}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      Production Status
                    </p>

                    <p className="text-sm font-medium mt-1">
                      {formatLabel(status)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Target Due Date
                    </p>

                    <p className="text-sm font-medium mt-1">
                      {formatDate(task?.due_date)}
                    </p>
                  </div>
                </div>

                {task?.notes && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-slate-500">
                      Production Update
                    </p>

                    <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                      {task.notes}
                    </p>
                  </div>
                )}

                {task?.updated_at && (
                  <p className="text-xs text-slate-500">
                    Last updated:{' '}
                    {formatDate(task.updated_at)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-sm text-slate-500">
          Production updates are provided by Legavora.
          This section is read-only and cannot be edited
          by authors.
        </p>
      </section>

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
