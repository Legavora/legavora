
import { currentUser } from '@/lib/supabase';
import { redirect, notFound } from 'next/navigation';
import ProjectActions from '@/components/ProjectActions';
import ApprovalButton from '@/components/ApprovalButton';

export const dynamic = 'force-dynamic';

export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, user } = await currentUser();

  if (!user) redirect('/login');

  const { data: p } = await db
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!p) notFound();

  const [
    { data: files },
    { data: approvals },
    { data: distribution },
  ] = await Promise.all([
    db.from('project_files')
      .select('id,file_name,created_at')
      .eq('project_id', id),

    db.from('approvals')
      .select('id,label,status,created_at')
      .eq('project_id', id),

    db.from('distribution_records')
      .select('platform,status,retailer_url')
      .eq('project_id', id),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-5 py-16">
      <p className="eyebrow">PUBLISHING PROJECT</p>

      <h1 className="heading text-4xl mt-3">{p.title}</h1>

      <p className="text-slate-600 mt-4">
        {p.genre} · {p.service} · {p.status}
      </p>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="panel">
          <h2 className="font-serif text-2xl">Current stage</h2>
          <p className="mt-3">{p.stage}</p>
          <p className="text-slate-600 mt-3">{p.description}</p>
        </div>

        <div className="panel">
          <h2 className="font-serif text-2xl">Your files</h2>

          {files?.length ? (
            files.map((f) => (
              <div
                className="flex items-center justify-between gap-4 border-b py-2"
                key={f.id}
              >
                <span className="text-sm break-all">
                  {f.file_name}
                </span>

                <a
                  href={`/api/files/download?id=${encodeURIComponent(f.id)}`}
                  className="text-sm font-semibold underline text-[#a67c36] shrink-0"
                >
                  Download
                </a>
              </div>
            ))
          ) : (
            <p className="text-slate-600 mt-3">
              No files uploaded yet.
            </p>
          )}

          <p className="text-xs text-slate-500 mt-3">
            For privacy, download links are issued only through
            authorized access.
          </p>
        </div>
      </div>

      <ProjectActions projectId={id} />

      <h2 className="heading text-3xl mt-12">
        Proof approvals
      </h2>

      <div className="grid gap-3 mt-4">
        {approvals?.length ? (
          approvals.map((a) => (
            <div
              className="panel flex items-center justify-between gap-4"
              key={a.id}
            >
              <div>
                <b>{a.label}</b>
                <p className="text-sm text-slate-500">
                  {a.status}
                </p>
              </div>

              {a.status === 'pending' && (
                <ApprovalButton id={a.id} />
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
        Distribution tracking
      </h2>

      <div className="grid gap-3 mt-4">
        {distribution?.length ? (
          distribution.map((d, i) => (
            <div
              className="panel flex justify-between"
              key={i}
            >
              <div>
                <b>{d.platform}</b>
                <p className="text-sm text-slate-500">
                  {d.status}
                </p>
              </div>

              {d.retailer_url &&
                /^https:\/\//.test(d.retailer_url) && (
                  <a
                    href={d.retailer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-[#a67c36]"
                  >
                    Retailer listing
                  </a>
                )}
            </div>
          ))
        ) : (
          <div className="panel">
            Distribution begins after final author approval
            and account authorization.
          </div>
        )}
      </div>
    </div>
  );
}
