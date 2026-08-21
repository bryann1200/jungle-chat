import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, type Chat, type Message, type Profile } from "@/lib/supabase";
import { formatTime } from "@/lib/chat-utils";
import { JungleAvatar } from "./Avatar";
import { NewChatModal } from "./NewChatModal";
import { SettingsModal } from "./SettingsModal";

type ChatMeta = Chat & {
  memberIds: string[];
  lastMessage: Message | null;
};

export function ChatApp({
  user,
  onBackgroundChange,
}: {
  user: User;
  onBackgroundChange: (url: string | null) => void;
}) {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadChats = useCallback(async () => {
    const [{ data: myParts }, { data: allProfiles }] = await Promise.all([
      supabase.from("chatapp_chat_participants").select("chat_id").eq("user_id", user.id),
      supabase.from("chatapp_profiles").select("id, username, avatar_color"),
    ]);

    const map: Record<string, Profile> = {};
    (allProfiles ?? []).forEach((p) => (map[p.id] = p as Profile));
    setProfiles(map);

    const ids = (myParts ?? []).map((p) => p.chat_id as string);
    if (ids.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }

    const [{ data: chatRows }, { data: parts }, { data: msgs }] = await Promise.all([
      supabase.from("chatapp_chats").select("*").in("id", ids),
      supabase.from("chatapp_chat_participants").select("chat_id, user_id").in("chat_id", ids),
      supabase
        .from("chatapp_messages")
        .select("*")
        .in("chat_id", ids)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const last: Record<string, Message> = {};
    (msgs ?? []).forEach((m) => {
      const msg = m as Message;
      if (!last[msg.chat_id]) last[msg.chat_id] = msg;
    });

    const metas: ChatMeta[] = (chatRows ?? []).map((c) => ({
      ...(c as Chat),
      memberIds: (parts ?? [])
        .filter((p) => p.chat_id === c.id)
        .map((p) => p.user_id as string),
      lastMessage: last[c.id as string] ?? null,
    }));
    metas.sort((a, b) => {
      const at = a.lastMessage?.created_at ?? a.created_at;
      const bt = b.lastMessage?.created_at ?? b.created_at;
      return bt.localeCompare(at);
    });
    setChats(metas);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  // Global realtime for sidebar previews
  useEffect(() => {
    const channel = supabase
      .channel("chatapp-all-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chatapp_messages" },
        () => void loadChats(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadChats]);

  // Load + subscribe to the active chat
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("chatapp_messages")
        .select("*")
        .eq("chat_id", activeId)
        .order("created_at", { ascending: true });
      if (!cancelled) setMessages((data ?? []) as Message[]);
    })();

    const channel = supabase
      .channel(`chatapp-messages-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chatapp_messages",
          filter: `chat_id=eq.${activeId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) ?? null,
    [chats, activeId],
  );

  const chatTitle = useCallback(
    (chat: ChatMeta) => {
      if (chat.is_group)
        return (
          chat.name ||
          chat.memberIds
            .filter((id) => id !== user.id)
            .map((id) => profiles[id]?.username ?? "monkey")
            .join(", ")
        );
      const other = chat.memberIds.find((id) => id !== user.id);
      return (other && profiles[other]?.username) || "Lonely banana";
    },
    [profiles, user.id],
  );

  async function send() {
    const content = draft.trim();
    if (!content || !activeId) return;
    setDraft("");
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      chat_id: activeId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("chatapp_messages")
      .insert({ chat_id: activeId, sender_id: user.id, content })
      .select()
      .single();

    if (error || !data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      return;
    }
    setMessages((prev) => {
      const withoutDupe = prev.filter((m) => m.id !== (data as Message).id);
      return withoutDupe.map((m) => (m.id === tempId ? (data as Message) : m));
    });
    void loadChats();
  }

  const people = useMemo(
    () => Object.values(profiles).filter((p) => p.id !== user.id),
    [profiles, user.id],
  );

  const myName = profiles[user.id]?.username ?? "me";

  return (
    <div className="flex h-dvh flex-col bg-cream">
      <header className="flex items-center gap-3 border-b-[3px] border-bark bg-banana px-4 py-3">
        <span className="text-2xl">🐵</span>
        <h1 className="flex-1 truncate text-xl font-extrabold text-bark">Monkey Chat</h1>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Background settings"
          className="rounded-full border-[3px] border-bark bg-cream px-3 py-1.5 text-lg"
        >
          ⚙️
        </button>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="rounded-full border-[3px] border-bark bg-leaf px-3 py-1.5 font-bold text-bark"
        >
          Out
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={`w-full shrink-0 flex-col border-r-[3px] border-bark bg-cream sm:flex sm:w-80 ${
            activeId ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="border-b-[3px] border-bark p-3">
            <button
              onClick={() => setShowNew(true)}
              className="w-full rounded-full border-[3px] border-bark bg-banana px-4 py-2.5 font-extrabold text-bark"
              style={{ boxShadow: "var(--shadow-bubbly)" }}
            >
              🍌 New chat
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading && <p className="p-4 text-center text-muted-foreground">Swinging in...</p>}
            {!loading && chats.length === 0 && (
              <p className="p-6 text-center text-lg font-bold text-bark">
                🐵 No chats yet — go bananas and start one!
              </p>
            )}
            {chats.map((chat) => {
              const title = chatTitle(chat);
              return (
                <button
                  key={chat.id}
                  onClick={() => setActiveId(chat.id)}
                  className={`mb-2 flex w-full items-center gap-3 rounded-2xl border-[3px] border-bark px-3 py-2 text-left ${
                    chat.id === activeId ? "bg-banana" : "bg-card"
                  }`}
                >
                  <JungleAvatar
                    name={title}
                    emoji={chat.is_group ? "🌴" : undefined}
                    size={42}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold text-bark">{title}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {chat.lastMessage?.content ?? "Say hi 🙉"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Chat pane */}
        <main className={`min-w-0 flex-1 flex-col ${activeId ? "flex" : "hidden sm:flex"}`}>
          {!activeChat ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <span className="text-6xl">🙊</span>
              <p className="text-xl font-extrabold text-bark">Pick a chat to start swinging</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b-[3px] border-bark bg-leaf/50 px-4 py-2">
                <button
                  onClick={() => setActiveId(null)}
                  className="rounded-full border-[3px] border-bark bg-cream px-3 py-1 font-bold text-bark sm:hidden"
                >
                  ←
                </button>
                <JungleAvatar
                  name={chatTitle(activeChat)}
                  emoji={activeChat.is_group ? "🌴" : undefined}
                  size={38}
                />
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-bark">{chatTitle(activeChat)}</p>
                  {activeChat.is_group && (
                    <p className="truncate text-xs text-muted-foreground">
                      {activeChat.memberIds
                        .map((id) => (id === user.id ? myName : profiles[id]?.username ?? "?"))
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-3xl border-[3px] border-bark px-4 py-2 ${
                          mine ? "bg-banana" : "bg-leaf"
                        } ${m.pending ? "opacity-60" : ""} ${m.failed ? "border-destructive" : ""}`}
                        style={{ boxShadow: "var(--shadow-soft)" }}
                      >
                        {!mine && activeChat.is_group && (
                          <p className="text-xs font-extrabold text-jungle">
                            {profiles[m.sender_id]?.username ?? "monkey"}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-bark">{m.content}</p>
                        <p className="mt-0.5 text-right text-[11px] text-bark/60">
                          {m.failed ? "❌ Failed to send" : formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className="flex items-center gap-2 border-t-[3px] border-bark bg-cream p-3"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type something bananas..."
                  className="min-w-0 flex-1 rounded-full border-[3px] border-bark bg-card px-4 py-2.5 outline-none focus:border-jungle"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  className="rounded-full border-[3px] border-bark bg-banana px-4 py-2.5 text-xl"
                  style={{ boxShadow: "var(--shadow-bubbly)" }}
                >
                  🍌
                </button>
              </form>
            </>
          )}
        </main>
      </div>

      {showNew && (
        <NewChatModal
          me={user.id}
          people={people}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            void loadChats().then(() => setActiveId(id));
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          userId={user.id}
          onClose={() => setShowSettings(false)}
          onSaved={onBackgroundChange}
        />
      )}
    </div>
  );
}
