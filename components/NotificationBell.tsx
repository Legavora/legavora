'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { browserDb } from '@/lib/supabase-browser';

export default function NotificationBell() {
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [available, setAvailable] =
    useState(false);

  const loadUnreadCount = useCallback(
    async () => {
      try {
        const db = browserDb();

        const {
          data: { user },
          error: authError,
        } = await db.auth.getUser();

        if (authError || !user) {
          setUnreadCount(0);
          setAvailable(false);
          return;
        }

        const { count, error } = await db
          .from('notifications')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq('recipient_id', user.id)
          .is('read_at', null);

        if (error) {
          throw error;
        }

        setUnreadCount(count ?? 0);
        setAvailable(true);
      } catch {
        setAvailable(false);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadUnreadCount();

    const interval = window.setInterval(
      () => {
        if (
          document.visibilityState === 'visible'
        ) {
          void loadUnreadCount();
        }
      },
      30000
    );

    function handleFocus() {
      void loadUnreadCount();
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState === 'visible'
      ) {
        void loadUnreadCount();
      }
    }

    window.addEventListener(
      'focus',
      handleFocus
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      window.clearInterval(interval);

      window.removeEventListener(
        'focus',
        handleFocus
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    void loadUnreadCount();
  }, [pathname, loadUnreadCount]);

  const displayCount =
    unreadCount > 99
      ? '99+'
      : String(unreadCount);

  const accessibleLabel = loading
    ? 'Notifications, loading unread count'
    : !available
      ? 'Notifications, unread count unavailable'
      : `Notifications, ${unreadCount} unread`;

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className="group inline-flex items-center gap-3 rounded-xl border border-[#e3dfd6] bg-white px-4 py-3 text-[#102030] transition hover:border-[#b88b45] hover:bg-[#faf7f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a77b36]"
    >
      <span className="relative inline-flex items-center justify-center">

        <Bell
          size={22}
          strokeWidth={1.8}
          aria-hidden="true"
          className="text-[#a77b36] transition group-hover:text-[#916722]"
        />

        {available && unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#b88b45]"
          />
        )}

      </span>

      <span className="text-sm font-semibold">
        Notifications
      </span>

      {!loading &&
        available &&
        unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="inline-flex min-w-[25px] items-center justify-center rounded-full bg-[#102030] px-2 py-1 text-xs font-semibold text-white"
          >
            {displayCount}
          </span>
        )}

    </Link>
  );
}
