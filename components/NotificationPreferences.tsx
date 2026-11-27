
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Bell,
  Mail,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  BookOpen,
  FileText,
  CreditCard,
  Users,
  MessageSquare,
  Megaphone,
  Layers,
  Globe,
} from 'lucide-react';

import { browserDb } from '@/lib/supabase-browser';

type Category =
  | 'project'
  | 'editorial'
  | 'production'
  | 'distribution'
  | 'contract'
  | 'invoice'
  | 'payment'
  | 'staff'
  | 'support'
  | 'marketing';

type PreferenceColumn =
  `email_${Category}_updates`;

type Preferences = Record<
  PreferenceColumn,
  boolean
>;

const categories = [
  {
    category: 'project',
    title: 'Project Updates',
    description:
      'Publishing project progress, milestones and important changes.',
    icon: BookOpen,
  },
  {
    category: 'editorial',
    title: 'Editorial Updates',
    description:
      'Manuscript reviews, editorial decisions and revision requests.',
    icon: FileText,
  },
  {
    category: 'production',
    title: 'Production Updates',
    description:
      'Formatting, cover design, proofreading and production progress.',
    icon: Layers,
  },
  {
    category: 'distribution',
    title: 'Distribution Updates',
    description:
      'Book distribution, publishing submissions and retailer status.',
    icon: Globe,
  },
  {
    category: 'contract',
    title: 'Contract and Agreement Updates',
    description:
      'New agreements, contract responses and related activities.',
    icon: FileText,
  },
  {
    category: 'invoice',
    title: 'Invoice Updates',
    description:
      'New invoices, billing information and invoice status changes.',
    icon: CreditCard,
  },
  {
    category: 'payment',
    title: 'Payment Updates',
    description:
      'Payment confirmations and transaction-related updates.',
    icon: CreditCard,
  },
  {
    category: 'staff',
    title: 'Staff Updates',
    description:
      'Project assignments, responsibilities and staff deliverables.',
    icon: Users,
  },
  {
    category: 'support',
    title: 'Support Updates',
    description:
      'Support requests, responses and account assistance.',
    icon: MessageSquare,
  },
  {
    category: 'marketing',
    title: 'Marketing Project Updates',
    description:
      'Book marketing activities, campaign progress and project reports.',
    icon: Megaphone,
  },
] as const;

const preferenceColumns = categories
  .map(
    (item) =>
      `email_${item.category}_updates`
  )
  .join(',');

function getColumn(
  category: Category
): PreferenceColumn {
  return `email_${category}_updates`;
}

export default function NotificationPreferences() {
  const [preferences, setPreferences] =
    useState<Preferences | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState<Category | null>(null);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const operationLock = useRef(false);

  const loadPreferences = useCallback(
    async () => {
      if (operationLock.current) return;

      operationLock.current = true;

      setLoading(true);
      setError('');
      setSuccess('');
      setPreferences(null);

      try {
        const db = browserDb();

        const {
          data: { user },
          error: authError,
        } = await db.auth.getUser();

        if (authError || !user) {
          throw new Error(
            'Please sign in to manage your notification preferences.'
          );
        }

        const {
          data,
          error: preferenceError,
        } = await db
          .from('notification_preferences')
          .select(preferenceColumns)
          .eq('user_id', user.id)
          .single();

        if (preferenceError || !data) {
          throw new Error(
            'Unable to retrieve notification preferences.'
          );
        }

        const record =
          data as unknown as Preferences;

        const valid = categories.every(
          (item) =>
            typeof record[
              getColumn(item.category)
            ] === 'boolean'
        );

        if (!valid) {
          throw new Error(
            'Invalid notification preference data.'
          );
        }

        setPreferences(record);
      } catch {
        setError(
          'Unable to load your notification preferences. Please try again.'
        );
      } finally {
        setLoading(false);
        operationLock.current = false;
      }
    },
    []
  );

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  async function updatePreference(
    category: Category,
    enabled: boolean
  ) {
    if (
      operationLock.current ||
      loading ||
      !preferences
    ) {
      return;
    }

    operationLock.current = true;

    setSaving(category);
    setError('');
    setSuccess('');

    try {
      const db = browserDb();

      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser();

      if (authError || !user) {
        throw new Error(
          'Authentication required.'
        );
      }

      const {
        data,
        error: rpcError,
      } = await db.rpc(
        'update_notification_preference',
        {
          p_category: category,
          p_enabled: enabled,
        }
      );

      if (rpcError || data !== true) {
        throw new Error(
          'Preference update failed.'
        );
      }

      const column = getColumn(category);

      setPreferences((previous) => {
        if (!previous) return previous;

        return {
          ...previous,
          [column]: enabled,
        };
      });

      const item = categories.find(
        (entry) =>
          entry.category === category
      );

      setSuccess(
        `${item?.title ?? 'Email notifications'} ${
          enabled ? 'enabled' : 'disabled'
        } successfully.`
      );
    } catch {
      setError(
        'Unable to confirm the preference update. Refresh your preferences before trying again.'
      );
    } finally {
      setSaving(null);
      operationLock.current = false;
    }
  }

  const enabledCount = preferences
    ? categories.filter(
        (item) =>
          preferences[
            getColumn(item.category)
          ] === true
      ).length
    : 0;

  return (
    <section
      aria-labelledby="notification-preferences-heading"
      className="space-y-6 rounded-2xl border border-[#e3dfd6] bg-white p-5 text-slate-900 sm:p-8"
    >

      <div className="flex flex-wrap items-start justify-between gap-5">

        <div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#a77b36]">
            Legavora Communications
          </p>

          <h2
            id="notification-preferences-heading"
            className="font-serif text-3xl text-[#102030]"
          >
            Notification Preferences
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Choose which publishing and account
            activities you would like to receive
            by email. Your preferences are saved
            automatically.
          </p>

        </div>

        <div className="rounded-xl border border-[#e3dfd6] bg-[#f5f2eb] px-5 py-4">

          <div className="flex items-center gap-3">

            <Mail
              size={24}
              className="text-[#a77b36]"
            />

            <div>

              <p className="text-2xl font-semibold text-[#102030]">
                {preferences
                  ? `${enabledCount}/${categories.length}`
                  : '—'}
              </p>

              <p className="text-xs text-slate-600">
                Email categories enabled
              </p>

            </div>

          </div>

        </div>

      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#e3dfd6] bg-[#faf8f3] p-4">

        <Bell
          size={20}
          className="mt-0.5 shrink-0 text-[#a77b36]"
        />

        <div>

          <p className="text-sm font-semibold text-[#102030]">
            Dashboard notifications remain active
          </p>

          <p className="mt-1 text-sm leading-6 text-slate-600">
            Turning off an email category does not
            prevent notifications from appearing
            inside your Legavora account.
            Emails already queued may still be
            delivered.
          </p>

        </div>

      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">

        <div className="flex items-center gap-2">

          <Settings
            size={19}
            className="text-[#a77b36]"
          />

          <h3 className="text-base font-semibold text-[#102030]">
            Email Notification Settings
          </h3>

        </div>

        <button
          type="button"
          disabled={
            loading || saving !== null
          }
          onClick={() => {
            void loadPreferences();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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

      {error && (

        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >

          <AlertCircle
            size={18}
            className="shrink-0"
          />

          <span>{error}</span>

        </div>

      )}

      {success && (

        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >

          <CheckCircle2
            size={18}
            className="shrink-0"
          />

          <span>{success}</span>

        </div>

      )}

      {loading ? (

        <div
          role="status"
          className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500"
        >

          <RefreshCw
            size={18}
            className="animate-spin"
          />

          Loading your notification preferences...

        </div>

      ) : preferences ? (

        <div className="divide-y divide-slate-200">

          {categories.map((item) => {

            const Icon = item.icon;

            const enabled =
              preferences[
                getColumn(item.category)
              ] === true;

            const isSaving =
              saving === item.category;

            return (

              <div
                key={item.category}
                className="flex items-start justify-between gap-4 py-5 sm:items-center"
              >

                <div className="flex min-w-0 items-start gap-3 sm:gap-4">

                  <div className="shrink-0 rounded-xl bg-[#f1ece2] p-3 text-[#a77b36]">

                    <Icon size={20} />

                  </div>

                  <div className="min-w-0">

                    <h4
                      id={`preference-title-${item.category}`}
                      className="text-sm font-semibold text-[#102030] sm:text-base"
                    >
                      {item.title}
                    </h4>

                    <p
                      id={`preference-description-${item.category}`}
                      className="mt-1 text-sm leading-6 text-slate-600"
                    >
                      {item.description}
                    </p>

                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {isSaving
                        ? 'Saving preference...'
                        : enabled
                          ? 'Email enabled'
                          : 'Email disabled'}
                    </p>

                  </div>

                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-labelledby={`preference-title-${item.category}`}
                  aria-describedby={`preference-description-${item.category}`}
                  disabled={
                    saving !== null ||
                    loading
                  }
                  onClick={() => {
                    void updatePreference(
                      item.category,
                      !enabled
                    );
                  }}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a77b36] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    enabled
                      ? 'bg-[#102030]'
                      : 'bg-slate-300'
                  }`}
                >

                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />

                </button>

              </div>

            );

          })}

        </div>

      ) : (

        <div className="rounded-xl border border-dashed border-slate-300 bg-[#faf9f6] px-6 py-10 text-center">

          <p className="text-sm text-slate-600">
            Notification preferences are currently
            unavailable. Use Refresh to try again.
          </p>

        </div>

      )}

      <div className="flex items-start gap-3 border-t border-slate-200 pt-5">

        <ShieldCheck
          size={20}
          className="mt-0.5 shrink-0 text-[#a77b36]"
        />

        <div>

          <p className="text-sm font-semibold text-[#102030]">
            Secure Communication Preferences
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Your preferences apply only to your
            personal Legavora account. Essential
            account and security communications
            may be managed separately. Marketing
            project updates do not constitute
            consent to promotional mailing lists.
          </p>

          <p className="mt-3 text-xs text-slate-500">
            Legavora Global Services Ltd · Secure
            Account Communications
          </p>

        </div>

      </div>

    </section>
  );
}
