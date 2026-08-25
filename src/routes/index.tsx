import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AuthScreen } from "@/components/chat/AuthScreen";
import { ChatApp } from "@/components/chat/ChatApp";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "junglechat — Real-time jungle messaging" },
      {
        name: "description",
        content:
          "Chat in real time with your troop. A playful monkey and banana themed messenger with group chats and instant delivery.",
      },
      { property: "og:title", content: "junglechat — Real-time jungle messaging" },
      {
        property: "og:description",
        content: "A playful monkey and banana themed real-time chat app for you and your troop.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [background, setBackground] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      if (data.session?.access_token) {
        void supabase.realtime.setAuth(data.session.access_token);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.access_token) {
        void supabase.realtime.setAuth(s.access_token);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    const pending = localStorage.getItem("chatapp_pending_username");
    const fallback = session.user.email?.split("@")[0] ?? "monkey";
    void supabase
      .from("chatapp_profiles")
      .upsert({ id: session.user.id, username: pending || fallback }, { onConflict: "id" })
      .then(() => localStorage.removeItem("chatapp_pending_username"));
  }, [session]);

  useEffect(() => {
    void supabase
      .from("chatapp_settings")
      .select("background_url")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setBackground((data?.background_url as string | null) ?? null));
  }, []);


  if (!ready) {
    return (
      <div className="jungle-emoji-bg flex min-h-screen items-center justify-center text-5xl">
        🐵
      </div>
    );
  }

  return session ? (
    <ChatApp user={session.user} onBackgroundChange={setBackground} />
  ) : (
    <AuthScreen backgroundUrl={background} />
  );
}
