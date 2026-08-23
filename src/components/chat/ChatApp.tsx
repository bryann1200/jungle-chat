import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  supabase,
  type Chat,
  type Message,
  type Profile,
  type Reaction,
  type Nickname,
} from "@/lib/supabase";
import { formatTime } from "@/lib/chat-utils";
import { JungleAvatar } from "./Avatar";
import { NewChatModal } from "./NewChatModal";
import { SettingsModal } from "./SettingsModal";

const REACTION_CHOICES = ["❤️", "🐵", "🍌", "😂", "🔥"];
const TYPING_TTL = 4000;

type ChatMeta = Chat & {
  memberIds: string[];
  readAt: Record<string, string | null>;
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
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [nicknames, setNicknames] = useState<Nickname[]>([]);
  const [nickOpen, setNickOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);

  const loadChats = useCallback(async () => {
    const [{ data: myParts }, { data: allProfiles }] = await Promise.all([
      supabase.from("chatapp_chat_participants").select("chat_id").eq("user_id", user.id),
      supabase.from("chatapp_profiles").select("*"),
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
      supabase
        .from("chatapp_chat_participants")
        .select("chat_id, user_id, last_read_at")
        .in("chat_id", ids),
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

    const metas: ChatMeta[] = (chatRows ?? []).map((c) => {
      const mine = (parts ?? []).filter((p) => p.chat_id === c.id);
      const readAt: Record<string, string | null> = {};
      mine.forEach((p) => (readAt[p.user_id as string] = (p.last_read_at as string) ?? null));
      return {
        ...(c as Chat),
        memberIds: mine.map((p) => p.user_id as string),
        readAt,
        lastMessage: last[c.id as string] ?? null,
      };
    });
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

  const loadNicknames = useCallback(async () => {
    const { data } = await supabase
      .from("chatapp_nicknames")
      .select("chat_id, set_by, target_user_id, nickname")
      .eq("set_by", user.id);
    setNicknames((data ?? []) as Nickname[]);
  }, [user.id]);

  useEffect(() => {
    void loadNicknames();
  }, [loadNicknames]);

  // Global realtime for sidebar previews + read receipts
  useEffect(() => {
    const channel = supabase
      .channel("chatapp-all-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chatapp_messages" },
        () => void loadChats(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatapp_chat_participants" },
        () => void loadChats(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadChats]);

  const markRead = useCallback(
    async (chatId: string) => {
      await supabase
        .from("chatapp_chat_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .eq("user_id", user.id);
      void loadChats();
    },
    [user.id, loadChats],
  );

  // Load + subscribe to the active chat (messages + reactions)
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setReactions([]);
      return;
    }
    let cancelled = false;
    setTyping({});
    void markRead(activeId);

    void (async () => {
      const { data } = await supabase
        .from("chatapp_messages")
        .select("*")
        .eq("chat_id", activeId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as Message[];
      setMessages(rows);
      if (rows.length) {
        const { data: rx } = await supabase
          .from("chatapp_message_reactions")
          .select("*")
          .in(
            "message_id",
            rows.map((m) => m.id),
          );
        if (!cancelled) setReactions((rx ?? []) as Reaction[]);
      } else {
        setReactions([]);
      }
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
          if (msg.sender_id !== user.id) void markRead(activeId);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatapp_message_reactions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Reaction;
          if (payload.eventType === "DELETE") {
            setReactions((prev) => prev.filter((r) => r.id !== row.id));
          } else {
            setReactions((prev) =>
              prev.some((r) => r.id === row.id) ? prev : [...prev, row],
            );
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeId, user.id, markRead]);

  // Typing indicator channel (realtime broadcast, no storage)
  useEffect(() => {
    if (!activeId) {
      typingChannelRef.current = null;
      return;
    }
    const channel = supabase
      .channel(`chatapp-typing-${activeId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        const id = (payload['payload'] as { userId?: string } | undefined)?.userId;
        if (!id || id === user.id) return;
        setTyping((prev) => ({ ...prev, [id]: Date.now() }));
      })
      .subscribe();
    typingChannelRef.current = channel;
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        let changed = false;
        Object.entries(prev).forEach(([id, t]) => {
          if (now - t < TYPING_TTL) next[id] = t;
          else changed = true;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => {
      clearInterval(timer);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [activeId, user.id]);

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    void typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id },
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) ?? null,
    [chats, activeId],
  );

  const nicknameFor = useCallback(
    (chatId: string, targetId: string) =>
      nicknames.find((n) => n.chat_id === chatId && n.target_user_id === targetId)?.nickname ??
      null,
    [nicknames],
  );

  const displayName = useCallback(
    (chatId: string, id: string) =>
      nicknameFor(chatId, id) ?? profiles[id]?.username ?? "monkey",
    [nicknameFor, profiles],
  );

  const chatTitle = useCallback(
    (chat: ChatMeta) => {
      if (chat.is_group)
        return (
          chat.name ||
          chat.memberIds
            .filter((id) => id !== user.id)
            .map((id) => displayName(chat.id, id))
            .join(", ")
        );
      const other = chat.memberIds.find((id) => id !== user.id);
      return (other && displayName(chat.id, other)) || "Lonely banana";
    },
    [displayName, user.id],
  );

  const nickTarget = useMemo(() => {
    if (!activeChat) return null;
    const others = activeChat.memberIds.filter((id) => id !== user.id);
    return others.length === 1 ? (others[0] as string) : null;
  }, [activeChat, user.id]);

  async function saveNickname(chatId: string, targetId: string) {
    const value = nickDraft.trim();
    setNickOpen(false);
    if (!value) {
      await supabase
        .from("chatapp_nicknames")
        .delete()
        .eq("chat_id", chatId)
        .eq("set_by", user.id)
        .eq("target_user_id", targetId);
    } else {
      await supabase.from("chatapp_nicknames").upsert(
        { chat_id: chatId, set_by: user.id, target_user_id: targetId, nickname: value },
        { onConflict: "chat_id,set_by,target_user_id" },
      );
    }
    void loadNicknames();
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setPickerFor(null);
    const existing = reactions.find(
      (r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji,
    );
    if (existing) {
      setReactions((prev) => prev.filter((r) => r.id !== existing.id));
      await supabase.from("chatapp_message_reactions").delete().eq("id", existing.id);
      return;
    }
    const { data } = await supabase
      .from("chatapp_message_reactions")
      .insert({ message_id: messageId, user_id: user.id, emoji })
      .select()
      .single();
    if (data)
      setReactions((prev) =>
        prev.some((r) => r.id === (data as Reaction).id)
          ? prev
          : [...prev, data as Reaction],
      );
  }

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

  async function sendPhoto(file: File, caption: string) {
    if (!activeId) return;
    const chatId = activeId;
    const tempId = `temp-${crypto.randomUUID()}`;
    const localUrl = URL.createObjectURL(file);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chat_id: chatId,
        sender_id: user.id,
        content: caption,
        created_at: new Date().toISOString(),
        pending: true,
        localUrl,
        file,
      },
    ]);
    await uploadAndInsert(tempId, chatId, file, caption);
  }

  async function uploadAndInsert(tempId: string, chatId: string, file: File, caption: string) {
    const safeName = file.name.replace(/[^\w.-]+/g, "-");
    const path = `${user.id}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("chatapp-photos")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

    if (upErr) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("chatapp-photos").getPublicUrl(path);

    const { data, error } = await supabase
      .from("chatapp_messages")
      .insert({ chat_id: chatId, sender_id: user.id, content: caption, image_url: publicUrl })
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

  function retryPhoto(m: Message) {
    if (!m.file) return;
    const file = m.file;
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)),
    );
    void uploadAndInsert(m.id, m.chat_id, file, m.content);
  }


  const people = useMemo(
    () => Object.values(profiles).filter((p) => p.id !== user.id),
    [profiles, user.id],
  );

  const myName = profiles[user.id]?.username ?? "me";

  const visibleChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const names = [
        chatTitle(c),
        c.name ?? "",
        ...c.memberIds.map((id) => profiles[id]?.username ?? ""),
      ];
      return names.some((n) => n.toLowerCase().includes(q));
    });
  }, [chats, search, chatTitle, profiles]);

  const typingNames = useMemo(
    () =>
      Object.keys(typing)
        .filter((id) => activeChat?.memberIds.includes(id))
        .map((id) => profiles[id]?.username ?? "monkey"),
    [typing, profiles, activeChat],
  );

  // Read state: who (other than me) has read up to a given message time
  function readersOf(iso: string) {
    if (!activeChat) return [];
    return activeChat.memberIds.filter(
      (id) => id !== user.id && (activeChat.readAt[id] ?? "") >= iso,
    );
  }

  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.sender_id === user.id && !m.pending && !m.failed) return m.id;
    }
    return null;
  }, [messages, user.id]);

  return (
    <div className="flex h-dvh flex-col bg-cream">
      <header className="flex items-center gap-3 border-b-[3px] border-bark bg-banana px-4 py-3">
        <span className="text-2xl">🐵</span>
        <h1 className="flex-1 truncate text-xl font-extrabold text-bark">junglechat</h1>
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
          <div className="space-y-2 border-b-[3px] border-bark p-3">
            <button
              onClick={() => setShowNew(true)}
              className="w-full rounded-full border-[3px] border-bark bg-banana px-4 py-2.5 font-extrabold text-bark"
              style={{ boxShadow: "var(--shadow-bubbly)" }}
            >
              🍌 New chat
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search chats"
              placeholder="🔍 Search monkeys & groups"
              className="w-full rounded-full border-[3px] border-bark bg-card px-4 py-2 outline-none focus:border-jungle"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading && <p className="p-4 text-center text-muted-foreground">Swinging in...</p>}
            {!loading && chats.length === 0 && (
              <p className="p-6 text-center text-lg font-bold text-bark">
                🐵 No chats yet — go bananas and start one!
              </p>
            )}
            {!loading && chats.length > 0 && visibleChats.length === 0 && (
              <p className="p-6 text-center font-bold text-bark">
                🙈 No chats match "{search}"
              </p>
            )}
            {visibleChats.map((chat) => {
              const title = chatTitle(chat);
              const mineRead = chat.readAt[user.id] ?? "";
              const unread =
                !!chat.lastMessage &&
                chat.lastMessage.sender_id !== user.id &&
                chat.lastMessage.created_at > mineRead;
              return (
                <button
                  key={chat.id}
                  onClick={() => {
                    setActiveId(chat.id);
                  }}
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
                    <span
                      className={`block truncate text-sm ${
                        unread ? "font-bold text-bark" : "text-muted-foreground"
                      }`}
                    >
                      {chat.lastMessage
                        ? chat.lastMessage.content ||
                          (chat.lastMessage.image_url ? "📷 Photo" : "")
                        : "Say hi 🙉"}

                    </span>
                  </span>
                  {unread && (
                    <span
                      aria-label="Unread"
                      className="size-3 shrink-0 rounded-full border-2 border-bark bg-mango"
                    />
                  )}
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
                  {typingNames.length > 0 ? (
                    <p className="truncate text-xs font-bold text-jungle">
                      🐒 {typingNames.join(", ")} {typingNames.length > 1 ? "are" : "is"}{" "}
                      typing...
                    </p>
                  ) : (
                    activeChat.is_group && (
                      <p className="truncate text-xs text-muted-foreground">
                        {activeChat.memberIds
                          .map((id) => (id === user.id ? myName : displayName(activeChat.id, id)))
                          .join(" · ")}
                      </p>
                    )
                  )}
                </div>
                {nickTarget && (
                  <button
                    onClick={() => {
                      setNickDraft(nicknameFor(activeChat.id, nickTarget) ?? "");
                      setNickOpen((v) => !v);
                    }}
                    className="ml-auto shrink-0 rounded-full border-[3px] border-bark bg-cream px-3 py-1 text-sm font-bold text-bark"
                  >
                    🏷️ Set nickname
                  </button>
                )}
              </div>

              {nickOpen && nickTarget && (
                <div className="flex items-center gap-2 border-b-[3px] border-bark bg-cream px-4 py-2">
                  <input
                    value={nickDraft}
                    onChange={(e) => setNickDraft(e.target.value)}
                    maxLength={32}
                    placeholder={`Nickname for ${profiles[nickTarget]?.username ?? "monkey"}`}
                    aria-label="Nickname"
                    className="min-w-0 flex-1 rounded-full border-[3px] border-bark bg-card px-4 py-1.5 outline-none focus:border-jungle"
                  />
                  <button
                    onClick={() => void saveNickname(activeChat.id, nickTarget)}
                    className="rounded-full border-[3px] border-bark bg-banana px-3 py-1.5 font-extrabold text-bark"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setNickOpen(false)}
                    aria-label="Cancel nickname"
                    className="rounded-full border-[3px] border-bark bg-card px-3 py-1.5 font-bold text-bark"
                  >
                    ✕
                  </button>
                </div>
              )}


              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  const mrx = reactions.filter((r) => r.message_id === m.id);
                  const grouped = Object.entries(
                    mrx.reduce<Record<string, string[]>>((acc, r) => {
                      (acc[r.emoji] ??= []).push(r.user_id);
                      return acc;
                    }, {}),
                  );
                  const readers = mine && m.id === lastMineId ? readersOf(m.created_at) : [];
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                    >
                      <div className={`flex max-w-[85%] items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                        <div
                          className={`rounded-3xl border-[3px] border-bark px-4 py-2 ${
                            mine ? "bg-banana" : "bg-leaf"
                          } ${m.pending ? "opacity-60" : ""} ${
                            m.failed ? "border-destructive" : ""
                          }`}
                          style={{ boxShadow: "var(--shadow-soft)" }}
                        >
                          {!mine && activeChat.is_group && (
                            <p className="text-xs font-extrabold text-jungle">
                              {activeChat ? displayName(activeChat.id, m.sender_id) : "monkey"}
                            </p>
                          )}
                          {(m.image_url || m.localUrl) && (
                            <div className="relative my-1">
                              <img
                                src={m.image_url ?? m.localUrl ?? ""}
                                alt={m.content || "Shared photo"}
                                onClick={() => setLightbox(m.image_url ?? m.localUrl ?? null)}
                                className="max-h-[320px] w-full max-w-[250px] cursor-zoom-in rounded-2xl border-[3px] border-bark object-cover"
                              />
                              {m.pending && (
                                <span className="absolute bottom-2 left-2 rounded-full border-2 border-bark bg-cream px-2 py-0.5 text-[11px] font-bold text-bark">
                                  🍌 Uploading...
                                </span>
                              )}
                            </div>
                          )}
                          {m.content && (
                            <p className="whitespace-pre-wrap break-words text-bark">{m.content}</p>
                          )}
                          <p className="mt-0.5 text-right text-[11px] text-bark/60">
                            {m.failed ? "❌ Failed to send" : formatTime(m.created_at)}
                          </p>
                          {m.failed && m.file && (
                            <button
                              type="button"
                              onClick={() => retryPhoto(m)}
                              className="mt-1 w-full rounded-full border-2 border-bark bg-mango px-2 py-0.5 text-xs font-bold text-bark"
                            >
                              🔁 Retry upload
                            </button>
                          )}

                        </div>
                        {!m.pending && !m.failed && (
                          <button
                            onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                            aria-label="React to message"
                            className="rounded-full border-2 border-bark bg-card px-1.5 py-0.5 text-xs opacity-70 hover:opacity-100"
                          >
                            ＋
                          </button>
                        )}
                      </div>

                      {pickerFor === m.id && (
                        <div className="mt-1 flex gap-1 rounded-full border-[3px] border-bark bg-card px-2 py-1">
                          {REACTION_CHOICES.map((e) => (
                            <button
                              key={e}
                              onClick={() => void toggleReaction(m.id, e)}
                              className="text-lg transition-transform hover:scale-125"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      )}

                      {grouped.length > 0 && (
                        <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
                          {grouped.map(([emoji, users]) => (
                            <button
                              key={emoji}
                              onClick={() => void toggleReaction(m.id, emoji)}
                              className={`rounded-full border-2 border-bark px-2 py-0.5 text-xs font-bold text-bark ${
                                users.includes(user.id) ? "bg-mango" : "bg-card"
                              }`}
                            >
                              {emoji} {users.length}
                            </button>
                          ))}
                        </div>
                      )}

                      {readers.length > 0 && (
                        <p className="mt-0.5 text-[11px] font-bold text-jungle">
                          👀 Read
                          {activeChat.is_group
                            ? ` by ${readers
                                .map((id) => profiles[id]?.username ?? "monkey")
                                .join(", ")}`
                            : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {typingNames.length > 0 && (
                <p className="px-4 pb-1 text-sm font-bold text-jungle">
                  🐵 {typingNames.join(", ")} {typingNames.length > 1 ? "are" : "is"} typing
                  <span className="animate-pulse">...</span>
                </p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className="flex items-center gap-2 border-t-[3px] border-bark bg-cream p-3"
              >

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const caption = draft.trim();
                    setDraft("");
                    void sendPhoto(file, caption);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Send a photo"
                  className="rounded-full border-[3px] border-bark bg-leaf px-3 py-2.5 text-xl"
                >
                  🖼️
                </button>

                <input
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    notifyTyping();
                  }}
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
          profile={profiles[user.id]}
          onClose={() => setShowSettings(false)}
          onSaved={onBackgroundChange}
          onProfileSaved={() => void loadChats()}
          onNuked={() => {
            setActiveId(null);
            setMessages([]);
            void loadChats();
          }}
        />
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-label="Photo viewer"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bark/80 p-4"
        >
          <img
            src={lightbox}
            alt="Full size photo"
            className="max-h-full max-w-full rounded-3xl border-[3px] border-banana object-contain"
          />
          <button
            onClick={() => setLightbox(null)}
            aria-label="Close photo"
            className="absolute right-4 top-4 rounded-full border-[3px] border-bark bg-banana px-3 py-1 text-xl font-bold text-bark"
          >
            ✕
          </button>
        </div>
      )}

    </div>
  );
}
