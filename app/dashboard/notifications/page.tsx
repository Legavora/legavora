import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { currentUser } from '@/lib/supabase';
import NotificationCentre from '@/components/NotificationCentre';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Notification Centre | Legavora',
  description:
    'View your secure Legavora account notifications.',
};

export default async function NotificationsPage() {
  const { db, user } = await currentUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    redirect('/dashboard');
  }

  const dashboardUrl =
    profile.role === 'admin' ||
    profile.role === 'manager'
      ? '/admin'
      : profile.role === 'specialist'
        ? '/staff'
        : '/dashboard';

  return (
    <main className="min-h-screen bg-[#f3f0e9] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">

        <Link
          href={dashboardUrl}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#102030] hover:text-[#a77b36]"
        >
          <ArrowLeft size={17} />
          Back to Dashboard
        </Link>

        <NotificationCentre />

      </div>
    </main>
  );
}
