'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const notices: Record<string, { message: string; success: boolean }> = {
  already_active: {
    message: 'This team member already has this active responsibility on this project. No duplicate assignment was created.',
    success: false,
  },
  assigned: {
    message: 'The team member has been assigned successfully. If a previous assignment existed, it has been reactivated.',
    success: true,
  },
  updated: {
    message: 'The assignment status has been updated successfully.',
    success: true,
  },
};

function NoticeContent() {
  const searchParams = useSearchParams();
  const key = searchParams.get('assignment_notice') || '';
  const notice = notices[key];

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border p-4 text-sm ${
        notice.success
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      {notice.message}
    </div>
  );
}

export default function AssignmentNotice() {
  return (
    <Suspense fallback={null}>
      <NoticeContent />
    </Suspense>
  );
}
