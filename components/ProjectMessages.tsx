
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { browserDb } from '@/lib/supabase-browser';

type ProjectMessage = {
  id: string;
  project_id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

type ProjectMessagesProps = {
  projectId: string;
};

type SendMessageResponse = {
  success?: boolean;
  messageId?: string;
  notificationSent?: boolean;
  error?: string;
};

const MAX_MESSAGE_LENGTH = 10000;

export default function ProjectMessages({
  projectId,
}: ProjectMessagesProps) {
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState('');
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('Author');

  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const dbRef = useRef<ReturnType<typeof browserDb> | null>(
    null
  );

  if (!dbRef.current) {
    dbRef.current = browserDb();
  }

  const db = dbRef.current;

  const isStaff =
    viewerRole === 'admin' || viewerRole === 'manager';

  const loadMessages = useCallback(async () => {
    const { data, error: loadError } = await db
      .from('project_messages')
      .select('id,project_id,sender_id,message,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(500);

    if (loadError) {
      setError('Unable to load project messages.');
      return false;
    }

    setMessages((data || []) as ProjectMessage[]);
    setError('');
    return true;
  }, [db, projectId]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);
      setError('');
      setNotice('');
      setUserId(null);
      setViewerRole('');
      setAuthorId(null);
      setAuthorName('Author');
      setMessages([]);

      const {
        data: { user },
        error: authError,
      } = await db.auth.getUser();

      if (!active) return;

      if (authError || !user) {
        setError('Please sign in to view project messages.');
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!active) return;

      if (profileError || !profile) {
        setError('Unable to verify your account.');
        setLoading(false);
        return;
      }

      const { data: project, error: projectError } = await db
        .from('projects')
        .select('id,author_id')
        .eq('id', projectId)
        .single();

      if (!active) return;

      if (projectError || !project) {
        setError('Unable to access this publishing project.');
        setLoading(false);
        return;
      }

      const role = profile.role;

      if (
        role !== 'author' &&
        role !== 'admin' &&
        role !== 'manager'
      ) {
        setError(
          'You are not authorized to view project messages.'
        );
        setLoading(false);
        return;
      }

      if (
        role === 'author' &&
        project.author_id !== user.id
      ) {
        setError(
          'You are not authorized to view this conversation.'
        );
        setLoading(false);
        return;
      }

      setUserId(user.id);
      setViewerRole(role);
      setAuthorId(project.author_id);

      if (role === 'admin' || role === 'manager') {
        const { data: authorProfile } = await db
          .from('profiles')
          .select('full_name')
          .eq('id', project.author_id)
          .single();

        if (!active) return;

        const name = authorProfile?.full_name?.trim();

        if (name) {
          setAuthorName(name);
        }
      }

      const { data, error: loadError } = await db
        .from('project_messages')
        .select('id,project_id,sender_id,message,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (!active) return;

      if (loadError) {
        setError('Unable to load project messages.');
      } else {
        setMessages((data || []) as ProjectMessage[]);
        setError('');
      }

      setLoading(false);
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [db, projectId]);

  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [messages.length, loading]);

  function getSenderLabel(senderId: string) {
    if (senderId === userId) {
      return 'You';
    }

    if (authorId && senderId === authorId) {
      return isStaff ? authorName : 'You';
    }

    return 'Legavora Publishing Team';
  }

  async function sendMessage(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const message = draft.trim();

    if (
      !userId ||
      loading ||
      sendingRef.current ||
      !message
    ) {
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      setError('Your message exceeds 10,000 characters.');
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError('');
    setNotice('');

    let response: Response;

    try {
      response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          projectId,
          message,
        }),
      });
    } catch {
      setError(
        'Unable to confirm whether your message was sent. ' +
        'Refresh the conversation before trying again.'
      );
      sendingRef.current = false;
      setSending(false);
      return;
    }

    let result: SendMessageResponse = {};

    try {
      result = (await response.json()) as SendMessageResponse;
    } catch {
      setError(
        'Unable to confirm the message result. ' +
        'Refresh the conversation before trying again.'
      );
      sendingRef.current = false;
      setSending(false);
      return;
    }

    if (!response.ok || !result.success) {
      setError(
        result.error ||
        'Your message could not be sent. Please try again.'
      );
      sendingRef.current = false;
      setSending(false);
      return;
    }

    // The server has confirmed the message was saved.
    // Clear the draft even if email delivery failed.
    setDraft('');

    const refreshed = await loadMessages();

    if (result.notificationSent === true) {
      setNotice(
        'Message sent successfully. Email notification sent.'
      );
    } else {
      setNotice(
        'Message saved successfully. The email notification ' +
        'could not be confirmed.'
      );
    }

    if (!refreshed) {
      setError(
        'Message saved, but the conversation could not refresh. ' +
        'Please use Refresh to load it.'
      );
    }

    sendingRef.current = false;
    setSending(false);
  }

  function formatTime(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Date unavailable';
    }

    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <section className="panel mt-8 space-y-5">
      <div>
        <h2 className="font-serif text-2xl">
          Project Messages
        </h2>

        <p className="text-sm text-slate-600 mt-2">
          Communicate securely about this publishing
          project. Messages are saved to the project
          conversation.
        </p>
      </div>

      <div
        className="rounded-xl border border-slate-200 bg-slate-50 p-4 max-h-[440px] min-h-[180px] overflow-y-auto space-y-4"
        aria-label="Project conversation"
      >
        {loading ? (
          <p className="text-sm text-slate-500">
            Loading conversation...
          </p>
        ) : error && !userId ? (
          <p className="text-sm text-red-700">
            Conversation unavailable.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            No messages yet. Start the conversation below.
          </p>
        ) : (
          messages.map((item) => {
            const isMine = item.sender_id === userId;

            return (
              <div
                key={item.id}
                className={`flex ${
                  isMine
                    ? 'justify-end'
                    : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    isMine
                      ? 'bg-[#14263d] text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold mb-2 ${
                      isMine
                        ? 'text-amber-200'
                        : 'text-[#a67c36]'
                    }`}
                  >
                    {getSenderLabel(item.sender_id)}
                  </p>

                  <p className="text-sm whitespace-pre-wrap break-words">
                    {item.message}
                  </p>

                  <p
                    className={`text-xs mt-3 ${
                      isMine
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {formatTime(item.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <p
          className="text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          className="text-sm text-green-700"
          role="status"
        >
          {notice}
        </p>
      )}

      <form
        onSubmit={sendMessage}
        className="space-y-3"
      >
        <label
          htmlFor={`project-message-${projectId}`}
          className="block text-sm font-semibold"
        >
          Write a message
        </label>

        <textarea
          id={`project-message-${projectId}`}
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value)
          }
          placeholder={
            isStaff
              ? 'Write your message to the author...'
              : 'Write your message to the publishing team...'
          }
          maxLength={MAX_MESSAGE_LENGTH}
          rows={4}
          disabled={loading || sending || !userId}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#cba45b] disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {draft.length.toLocaleString()} / 10,000 characters
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void loadMessages()}
              disabled={loading || sending || !userId}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Refresh
            </button>

            <button
              type="submit"
              disabled={
                loading ||
                sending ||
                !userId ||
                !draft.trim()
              }
              className="rounded-lg bg-[#14263d] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending
                ? 'Sending...'
                : 'Send Message'}
            </button>
          </div>
        </div>
      </form>

      <p className="text-xs text-slate-500">
        Messages are visible to the project author and
        authorized Legavora staff. Please do not share
        passwords or sensitive payment information here.
      </p>
    </section>
  );
}
