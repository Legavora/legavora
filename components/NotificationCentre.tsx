'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
  ArrowUpRight,
  FileText,
  CreditCard,
  BookOpen,
  Users,
  MessageSquare,
  Megaphone,
  ShieldCheck,
} from 'lucide-react';
import { browserDb } from '@/lib/supabase-browser';

type Notification = {
  id: string;
  event_type: string;
  category: string;
  title: string;
  message: string;
  priority: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

type Filter = 'all' | 'unread' | 'read';

const PAGE_SIZE = 50;

function categoryIcon(category: string) {
  switch (category) {
    case 'project':
    case 'distribution':
      return BookOpen;
    case 'manuscript':
    case 'editorial':
    case 'contract':
    case 'approval':
      return FileText;
    case 'invoice':
    case 'payment':
      return CreditCard;
    case 'staff':
      return Users;
    case 'support':
    case 'message':
      return MessageSquare;
    case 'marketing':
      return Megaphone;
    case 'security':
      return ShieldCheck;
    default:
      return Bell;
  }
}

function formatCategory(category: string) {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function safeActionUrl(value: string | null) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  try {
    const base = 'https://legavora.invalid';
    const url = new URL(value, base);

    if (url.origin !== base) {
      return null;
    }

    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export default function NotificationCentre() {
  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [filter, setFilter] =
    useState<Filter>('all');

  const [category, setCategory] =
    useState('all');

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState<string | null>(null);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const [hasMore, setHasMore] =
    useState(false);

  const [limit, setLimit] =
    useState(PAGE_SIZE);

  const loadNotifications = useCallback(
    async () => {
      setLoading(true);
      setError('');

      try {
        const db = browserDb();

        const {
          data: { user },
          error: authError,
        } = await db.auth.getUser();

        if (authError || !user) {
          throw new Error(
            'Please sign in to view your notifications.'
          );
        }

        let query = db
          .from('notifications')
          .select(
            'id,event_type,category,title,message,priority,action_url,read_at,created_at'
          )
          .eq('recipient_id', user.id)
          .order('created_at', {
            ascending: false,
          })
          .order('id', {
            ascending: false,
          });

        if (filter === 'unread') {
          query = query.is('read_at', null);
        }

        if (filter === 'read') {
          query = query.not('read_at', 'is', null);
        }

        if (category !== 'all') {
          query = query.eq('category', category);
        }

        const [
          notificationResult,
          countResult,
        ] = await Promise.all([
          query.limit(limit + 1),

          db
            .from('notifications')
            .select('id', {
              count: 'exact',
              head: true,
            })
            .eq('recipient_id', user.id)
            .is('read_at', null),
        ]);

        if (notificationResult.error) {
          throw notificationResult.error;
        }

        if (countResult.error) {
          throw countResult.error;
        }

        const records =
          (notificationResult.data ??
            []) as Notification[];

        setHasMore(records.length > limit);

        setNotifications(
          records.slice(0, limit)
        );

        setUnreadCount(
          countResult.count ?? 0
        );
      } catch {
        setError(
          'Unable to load your notifications. Please try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [filter, category, limit]
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markAsRead(id: string) {
    if (busy || loading) return;

    setBusy(id);
    setError('');
    setSuccess('');

    try {
      const db = browserDb();

      const { data, error: rpcError } =
        await db.rpc(
          'mark_notification_read',
          {
            p_notification_id: id,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      if (data === false) {
        throw new Error(
          'Notification could not be updated.'
        );
      }

      setSuccess(
        'Notification marked as read.'
      );

      await loadNotifications();
    } catch {
      setError(
        'Unable to mark this notification as read.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function markAllAsRead() {
    if (
      busy ||
      loading ||
      unreadCount === 0
    ) {
      return;
    }

    setBusy('all');
    setError('');
    setSuccess('');

    try {
      const db = browserDb();

      const { error: rpcError } =
        await db.rpc(
          'mark_all_notifications_read'
        );

      if (rpcError) {
        throw rpcError;
      }

      setSuccess(
        'All notifications marked as read.'
      );

      await loadNotifications();
    } catch {
      setError(
        'Unable to mark all notifications as read.'
      );
    } finally {
      setBusy(null);
    }
  }

  const filters: {
    value: Filter;
    label: string;
  }[] = [
    { value: 'all', label: 'All Notifications' },
    { value: 'unread', label: 'Unread' },
    { value: 'read', label: 'Read' },
  ];

  return (
    <section className="space-y-6 rounded-2xl border border-[#e3dfd6] bg-white p-5 text-slate-900 sm:p-8">

      <div className="flex flex-wrap items-start justify-between gap-5">

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#a77b36]">
            Legavora Communications
          </p>

          <h2 className="font-serif text-3xl text-[#102030]">
            Notification Centre
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Stay informed about your publishing
            projects, agreements, invoices,
            account activity and important updates.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#e3dfd6] bg-[#f5f2eb] px-5 py-4">

          <Bell
            size={24}
            className="text-[#a77b36]"
          />

          <div>
            <p className="text-2xl font-semibold text-[#102030]">
              {unreadCount}
            </p>

            <p className="text-xs text-slate-600">
              Unread notifications
            </p>
          </div>

        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">

        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={loading || busy !== null}
            onClick={() => {
              setFilter(item.value);
              setLimit(PAGE_SIZE);
              setSuccess('');
            }}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              filter === item.value
                ? 'bg-[#102030] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            } disabled:opacity-60`}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          disabled={loading || busy !== null}
          onClick={() => {
            setSuccess('');
            void loadNotifications();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={
              loading ? 'animate-spin' : ''
            }
          />
          Refresh
        </button>

      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">

        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">

          Category

          <select
            value={category}
            disabled={loading || busy !== null}
            onChange={(event) => {
              setCategory(event.target.value);
              setLimit(PAGE_SIZE);
              setSuccess('');
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">
              All Categories
            </option>
            <option value="project">
              Project Updates
            </option>
            <option value="manuscript">
              Manuscripts
            </option>
            <option value="editorial">
              Editorial
            </option>
            <option value="approval">
              Approvals
            </option>
            <option value="distribution">
              Distribution
            </option>
            <option value="contract">
              Agreements
            </option>
            <option value="invoice">
              Invoices
            </option>
            <option value="payment">
              Payments
            </option>
            <option value="staff">
              Staff Updates
            </option>
            <option value="support">
              Support
            </option>
            <option value="message">
              Messages
            </option>
            <option value="marketing">
              Marketing
            </option>
            <option value="security">
              Security
            </option>
            <option value="system">
              System Updates
            </option>
          </select>

        </label>

        <button
          type="button"
          disabled={
            loading ||
            busy !== null ||
            unreadCount === 0
          }
          onClick={() => {
            void markAllAsRead();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-[#c6a36a] px-4 py-2.5 text-sm font-semibold text-[#916722] hover:bg-[#f8f4eb] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCheck size={18} />

          {busy === 'all'
            ? 'Updating...'
            : 'Mark All as Read'}

        </button>

      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {success}
        </div>
      )}

      {loading ? (

        <div
          role="status"
          className="py-12 text-center text-sm text-slate-500"
        >
          Loading your notifications...
        </div>

      ) : notifications.length === 0 && !error ? (

        <div className="rounded-xl border border-dashed border-slate-300 bg-[#faf9f6] px-6 py-14 text-center">

          <Bell
            size={38}
            className="mx-auto mb-4 text-[#a77b36]"
          />

          <h3 className="text-lg font-semibold text-[#102030]">
            {filter === 'unread'
              ? "You're all caught up"
              : 'No notifications found'}
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            {filter === 'unread'
              ? 'You have no unread notifications matching this selection.'
              : 'Notifications matching your selection will appear here.'}
          </p>

        </div>

      ) : (

        <div className="space-y-3">

          {notifications.map((notification) => {
            const Icon = categoryIcon(
              notification.category
            );

            const isUnread =
              notification.read_at === null;

            const actionUrl = safeActionUrl(
              notification.action_url
            );

            return (
              <article
                key={notification.id}
                className={`rounded-xl border p-5 transition ${
                  isUnread
                    ? 'border-[#d9c59e] bg-[#fcfaf5]'
                    : 'border-slate-200 bg-white'
                }`}
              >

                <div className="flex items-start gap-4">

                  <div className="shrink-0 rounded-xl bg-[#f1ece2] p-3 text-[#a77b36]">
                    <Icon size={21} />
                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="mb-2 flex flex-wrap items-center gap-2">

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {formatCategory(
                          notification.category
                        )}
                      </span>

                      {isUnread && (
                        <span className="rounded-full bg-[#102030] px-3 py-1 text-xs font-medium text-white">
                          New
                        </span>
                      )}

                      {notification.priority ===
                        'high' ||
                      notification.priority ===
                        'urgent' ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                          {formatCategory(
                            notification.priority
                          )}
                        </span>
                      ) : null}

                    </div>

                    <h3 className="break-words text-base font-semibold text-[#102030]">
                      {notification.title}
                    </h3>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                      {notification.message}
                    </p>

                    <p className="mt-3 text-xs text-slate-500">
                      {formatDate(
                        notification.created_at
                      )}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-4">

                      {actionUrl && (
                        <Link
                          href={actionUrl}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#916722] hover:underline"
                        >
                          View Details
                          <ArrowUpRight size={15} />
                        </Link>
                      )}

                      {isUnread ? (

                        <button
                          type="button"
                          disabled={
                            busy !== null ||
                            loading
                          }
                          onClick={() => {
                            void markAsRead(
                              notification.id
                            );
                          }}
                          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#102030] disabled:opacity-50"
                        >
                          <Check size={16} />

                          {busy === notification.id
                            ? 'Updating...'
                            : 'Mark as Read'}

                        </button>

                      ) : (

                        <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                          <CheckCheck size={15} />
                          Read
                        </span>

                      )}

                    </div>

                  </div>

                </div>

              </article>
            );
          })}

          {hasMore && (
            <div className="pt-4 text-center">

              <button
                type="button"
                disabled={
                  loading || busy !== null
                }
                onClick={() =>
                  setLimit(
                    (previous) =>
                      previous + PAGE_SIZE
                  )
                }
                className="rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold text-[#102030] hover:bg-slate-50 disabled:opacity-50"
              >
                Load More Notifications
              </button>

            </div>
          )}

        </div>

      )}

      <div className="border-t border-slate-200 pt-5">

        <p className="text-xs leading-5 text-slate-500">
          Legavora Global Services Ltd · Secure
          Account Communications
        </p>

      </div>

    </section>
  );
}
