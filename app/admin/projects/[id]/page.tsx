                  </h3>
                  <span className="text-sm font-semibold">
                    {format(currentStatus)}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-2 text-sm font-medium">
                    <span>Production Status</span>
                    <select
                      key={`${stage.key}-${currentStatus}`}
                      name="status"
                      defaultValue={currentStatus}
                      className="w-full rounded-md border bg-white p-3 text-slate-900"
                    >
                      {PRODUCTION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {format(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-2 text-sm font-medium">
                    <span>Due Date</span>
                    <input
                      key={`${stage.key}-${task?.due_date || ''}`}
                      type="date"
                      name="due_date"
                      defaultValue={task?.due_date || ''}
                      className="w-full rounded-md border bg-white p-3 text-slate-900"
                    />
                  </label>
                </div>

                <label className="block space-y-2 text-sm font-medium">
                  <span>Production Notes</span>
                  <textarea
                    key={`${stage.key}-${task?.updated_at || 'new'}`}
                    name="notes"
                    defaultValue={task?.notes || ''}
                    rows={3}
                    maxLength={5000}
                    placeholder="Record progress, deliverables, or outstanding work."
                    className="w-full rounded-md border bg-white p-3 text-slate-900"
                  />
                </label>

                <p className="text-xs text-slate-600">
                  Assigned staff: {task?.assigned_to ? 'Assigned' : 'Not assigned'}
                  {task?.updated_at
                    ? ` · Last updated: ${formatDate(task.updated_at)}`
                    : ' · Not yet saved'}
                </p>

                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
                >
                  Save Production Stage
                </button>
              </form>
            );
          })}
        </div>
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
