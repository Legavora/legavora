
import { currentUser } from '@/lib/supabase';
import { redirect, notFound } from 'next/navigation';
import ProjectActions from '@/components/ProjectActions';
import ApprovalButton from '@/components/ApprovalButton';
import ProjectMessages from '@/components/ProjectMessages';
import AuthorContractResponse from '@/components/AuthorContractResponse';

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
  { key: 'interior_formatting', label: 'Interior Formatting and Layout' },
  { key: 'cover_design', label: 'Cover Design' },
  { key: 'proofreading', label: 'Proofreading' },
  { key: 'quality_control', label: 'Quality Control' },
  { key: 'author_proof_approval', label: 'Author Proof Approval' },
  { key: 'final_production_approval', label: 'Final Production Approval' },
  { key: 'distribution_preparation', label: 'Distribution Preparation' },
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
  if (value === 'ebook') return 'eBook';

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

function safeRetailerUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, user } = await currentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/projects/${id}`)}`);
  }

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
    { data: distribution, error: distributionError },
    { data: productionTasks, error: productionError },
  ] = await Promise.all([
    db
      .from('project_files')
      .select('id,file_name,created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),

    db
      .from('approvals')
      .select('id,label,status,created_at,file_id')
      .eq('project_id', id),

    db
      .from('distribution_records')
      .select('id,platform,book_format,status,isbn,external_identifier,retailer_url,submitted_at,published_at,updated_at')
      .eq('project_id', id)
      .order('updated_at', { ascending: false }),

    db
      .from('production_tasks')
      .select(
        'id,task_type,status,due_date,notes,updated_at'
      )
      .eq('project_id', id),
  ]);

  const { data: contracts, error: contractsError } = await db
    .from('contracts')
    .select('id,title,contract_type')
    .eq('project_id', id)
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });

  const contractIds = (contracts ?? []).map((contract) => contract.id);
  const { data: versions, error: versionsError } = contractIds.length
    ? await db.from('contract_versions')
        .select('id,contract_id,version_number,file_name,storage_path,status,issued_at,document_sha256')
        .in('contract_id', contractIds)
        .not('issued_at', 'is', null)
        .neq('status', 'draft')
        .order('version_number', { ascending: false })
    : { data: [], error: null };

  const versionIds = (versions ?? []).map((version) => version.id);
  const { data: responses, error: responsesError } = versionIds.length
    ? await db.from('contract_responses')
        .select('contract_version_id,decision,full_name,responded_at,acceptance_statement,document_sha256,response_notes')
        .in('contract_version_id', versionIds)
        .eq('author_id', user.id)
    : { data: [], error: null };

  const responseMap = new Map((responses ?? []).map((response) => [response.contract_version_id, response] as const));

  const issuedVersions = await Promise.all((versions ?? []).map(async (version) => {
    const { data, error } = await db.storage.from('contracts')
      .createSignedUrl(version.storage_path, 300, { download: version.file_name });
    return { ...version, downloadUrl: error ? null : data?.signedUrl ?? null };
  }));

  if (responsesError) {
    console.error('Unable to load agreement responses:', responsesError.message);
  }

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

  const inProgressProductionStages =
    productionStages.filter((stage) => {
      return taskMap.get(stage.key)?.status === 'in_progress';
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

            <p className="text-xs font-medium text-slate-700 mt-2">
              {inProgressProductionStages}{' '}
              {inProgressProductionStages === 1
                ? 'stage'
                : 'stages'}{' '}
              in progress
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

        <p className="text-sm text-slate-600">
          Production completion is calculated from fully
          completed stages. Stages currently in progress
          are tracked separately.
        </p>

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

      <section className="panel mt-8 space-y-5" aria-labelledby="contracts-heading">
        <div>
          <p className="eyebrow">LEGAVORA AGREEMENTS</p>
          <h2 id="contracts-heading" className="font-serif text-2xl mt-2">
            Your Publishing Agreements
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            Review and download agreements officially issued to you by Legavora.
          </p>
        </div>
        {contractsError || versionsError ? (
          <p role="alert" className="text-sm text-red-700">
            Agreements are temporarily unavailable. Please refresh and try again.
          </p>
        ) : issuedVersions.length === 0 ? (
          <p className="text-sm text-slate-600">No agreements have been issued to you for this project.</p>
        ) : (
          <div className="space-y-4">
            {(contracts ?? []).filter((contract) => issuedVersions.some((v) => v.contract_id === contract.id)).map((contract) => (
              <article key={contract.id} className="rounded-xl border border-slate-200 p-5 space-y-4">
                <h3 className="font-semibold text-lg">{contract.title}</h3>
                <p className="text-sm text-slate-600">{formatLabel(contract.contract_type)}</p>
                {issuedVersions.filter((version) => version.contract_id === contract.id).map((version) => (
                  <div key={version.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold">Version {version.version_number}</p>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">{formatLabel(version.status)}</span>
                    </div>
                    <p className="text-sm break-all">{version.file_name}</p>
                    <p className="text-sm text-slate-600">Issued: {formatDate(version.issued_at)}</p>
                    {version.downloadUrl ? (
                      <a href={version.downloadUrl} referrerPolicy="no-referrer" className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
                        Download Agreement (PDF)
                      </a>
                    ) : (
                      <p role="alert" className="text-sm text-red-700">Download unavailable. Refresh the page to try again.</p>
                    )}
                    {(() => {
                      const response = responseMap.get(version.id);
                      if (responsesError) {
                        return <p role="alert" className="text-sm text-red-700">Agreement response history is temporarily unavailable.</p>;
                      }
                      if (!response) {
                        return ['accepted', 'declined'].includes(version.status) ? (
                          <p role="alert" className="text-sm text-amber-800">The recorded response details are unavailable. Please contact Legavora.</p>
                        ) : null;
                      }
                      const accepted = response.decision === 'accepted';
                      const fingerprintMatches = /^[0-9a-f]{64}$/.test(version.document_sha256) && response.document_sha256 === version.document_sha256;
                      const consentRecorded = accepted && Boolean(response.acceptance_statement?.trim());
                      return (
                        <section className={`rounded-lg border p-5 space-y-4 ${accepted ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                          <h4 className="font-semibold">{accepted ? 'Agreement Accepted' : 'Agreement Declined'}</h4>
                          <dl className="grid gap-4 text-sm sm:grid-cols-2">
                            <div><dt className="text-slate-600">{accepted ? 'Accepted by' : 'Declined by'}</dt><dd className="font-medium break-words">{response.full_name}</dd></div>
                            <div><dt className="text-slate-600">Response date and time (UTC)</dt><dd className="font-medium">{response.responded_at ? new Date(response.responded_at).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'long', timeStyle: 'medium' }) : 'Unavailable'}</dd></div>
                            <div><dt className="text-slate-600">Agreement version</dt><dd>Version {version.version_number}</dd></div>
                            <div><dt className="text-slate-600">Electronic acceptance consent</dt><dd>{consentRecorded ? 'Recorded' : 'Not recorded'}</dd></div>
                          </dl>
                          <div className="border-t pt-3 text-sm space-y-2">
                            <p className={fingerprintMatches ? 'text-green-800' : 'text-red-700'}>{fingerprintMatches ? 'Recorded document fingerprint matches the agreement version.' : 'Document fingerprint mismatch or unavailable. Please contact Legavora.'}</p>
                            <p className="text-xs text-slate-600 break-all font-mono">SHA-256: {response.document_sha256}</p>
                          </div>
                          {consentRecorded && <div className="border-t pt-3 text-sm"><p className="font-medium">Recorded acceptance statement</p><p className="mt-2 whitespace-pre-wrap break-words">{response.acceptance_statement}</p></div>}
                          {response.response_notes && <div className="border-t pt-3 text-sm"><p className="font-medium">Your response notes</p><p className="mt-2 whitespace-pre-wrap break-words">{response.response_notes}</p></div>}
                        </section>
                      );
                    })()}
                    {version.status === 'awaiting_acceptance' && (
                      version.downloadUrl && /^[0-9a-f]{64}$/.test(version.document_sha256) ? (
                        <AuthorContractResponse
                          contractVersionId={version.id}
                          contractTitle={contract.title}
                          versionNumber={version.version_number}
                          documentSha256={version.document_sha256}
                          status={version.status}
                        />
                      ) : (
                        <p role="alert" className="text-sm text-red-700">
                          Agreement response is unavailable until the document can be accessed and its fingerprint is available. Please refresh and try again.
                        </p>
                      )
                    )}
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">Download links expire after five minutes. Refresh this page to obtain a new link.</p>
      </section>

      <ProjectActions projectId={id} />

      <section id="project-messages" className="scroll-mt-24">
        <ProjectMessages projectId={id} />
      </section>

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

              <div className="flex flex-wrap items-center gap-3">
                {approval.file_id && (
                  <a
                    href={`/api/author/proofs/view?id=${encodeURIComponent(approval.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-[#cba45b] px-4 py-2 text-sm font-semibold text-[#a67c36] hover:bg-amber-50"
                    aria-label={`View proof: ${approval.label}`}
                  >
                    View Proof
                  </a>
                )}

                {approval.status === 'pending' && (
                  <ApprovalButton id={approval.id} />
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="panel">
            No proofs are awaiting approval.
          </div>
        )}
      </div>

      <section className="mt-12 space-y-4" aria-labelledby="distribution-heading">
        <h2 id="distribution-heading" className="heading text-3xl">
          Distribution Tracking
        </h2>
        <p className="text-sm text-slate-600">
          Follow the publishing progress of each book format and platform.
          Distribution updates are managed by Legavora.
        </p>
        {distributionError ? (
          <div className="panel text-sm text-red-700" role="alert">
            Distribution updates are temporarily unavailable. Please check again later.
          </div>
        ) : distribution?.length ? (
          <div className="grid gap-4">
            {distribution.map((record) => {
              const url = safeRetailerUrl(record.retailer_url);
              return (
                <article key={record.id} className="panel space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-lg">{record.platform}</h3>
                      <p className="text-sm text-slate-600 mt-1">
                        {formatLabel(record.book_format)}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${record.status === 'live' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                      {formatLabel(record.status)}
                    </span>
                  </div>
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-slate-500">ISBN</dt><dd className="break-all">{record.isbn || 'Not assigned'}</dd></div>
                    <div><dt className="text-slate-500">ASIN / External Identifier</dt><dd className="break-all">{record.external_identifier || 'Not assigned'}</dd></div>
                    <div><dt className="text-slate-500">Submission Date</dt><dd>{formatDate(record.submitted_at)}</dd></div>
                    <div><dt className="text-slate-500">Publication Date</dt><dd>{formatDate(record.published_at)}</dd></div>
                  </dl>
                  {record.status === 'live' && url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold underline text-[#a67c36]">
                      View Retailer Listing
                    </a>
                  )}
                  <p className="text-xs text-slate-500">Last updated: {formatDate(record.updated_at)}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel">
            Distribution information will appear here when Legavora adds publishing updates for your project.
          </div>
        )}
        <p className="text-xs text-slate-500">
          This tracker is read-only. It records distribution progress and does not process publishing submissions or author royalties.
        </p>
      </section>
    </div>
  );
}
