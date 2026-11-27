
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  Settings,
} from 'lucide-react';

import { currentUser } from '@/lib/supabase';
import NotificationCentre from '@/components/NotificationCentre';
import NotificationPreferences from '@/components/NotificationPreferences';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Notification Centre | Legavora',
  description:
    'View your secure Legavora account notifications and manage your email communication preferences.',
};

type PageProps = {
  searchParams: Promise<{
    tab?: string | string[];
  }>;
};

export default async function NotificationsPage({
  searchParams,
}: PageProps) {
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

  const allowedRoles = [
    'author',
    'specialist',
    'manager',
    'admin',
  ];

  if (!allowedRoles.includes(profile.role)) {
    redirect('/dashboard');
  }

  const dashboardUrl =
    profile.role === 'admin' ||
    profile.role === 'manager'
      ? '/admin'
      : profile.role === 'specialist'
        ? '/staff'
        : '/dashboard';

  const params = await searchParams;

  const activeTab =
    params.tab === 'preferences'
      ? 'preferences'
      : 'notifications';

  const notificationPage =
    '/dashboard/notification';

  const tabs = [
    {
      value: 'notifications',
      label: 'Notifications',
      href: notificationPage,
      icon: Bell,
    },
    {
      value: 'preferences',
      label: 'Email Preferences',
      href: `${notificationPage}?tab=preferences`,
      icon: Settings,
    },
  ] as const;

  return (
    <main className="min-h-screen bg-[#f3f0e9] px-4 py-10 sm:px-6 lg:px-8">

      <div className="mx-auto max-w-6xl space-y-6">

        <Link
          href={dashboardUrl}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#102030] transition hover:text-[#a77b36]"
        >
          <ArrowLeft size={17} />
          Back to Dashboard
        </Link>

        <header className="rounded-2xl border border-[#e3dfd6] bg-white p-6 sm:p-8">

          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#a77b36]">
            Legavora Account Communications
          </p>

          <h1 className="font-serif text-3xl text-[#102030] sm:text-4xl">
            Communications Centre
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Stay connected with your publishing
            activities, important account updates
            and communication preferences through
            your secure Legavora account.
          </p>

        </header>

        <nav
          aria-label="Notification navigation"
          className="flex flex-wrap gap-3 rounded-xl border border-[#e3dfd6] bg-white p-3"
        >

          {tabs.map((tab) => {
            const Icon = tab.icon;

            const isActive =
              activeTab === tab.value;

            return (
              <Link
                key={tab.value}
                href={tab.href}
                aria-current={
                  isActive ? 'page' : undefined
                }
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-sm font-semibold transition sm:flex-none ${
                  isActive
                    ? 'bg-[#102030] text-white'
                    : 'border border-[#e3dfd6] bg-white text-slate-700 hover:bg-[#f5f2eb] hover:text-[#102030]'
                }`}
              >

                <Icon size={19} />

                {tab.label}

              </Link>
            );
          })}

        </nav>

        {activeTab === 'preferences' ? (
          <NotificationPreferences />
        ) : (
          <NotificationCentre />
        )}

      </div>

    </main>
  );
}
