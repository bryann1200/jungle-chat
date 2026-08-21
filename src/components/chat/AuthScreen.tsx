import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function AuthScreen({ backgroundUrl }: { backgroundUrl: string | null }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!username.trim()) throw new Error("Pick a monkey name!");
        localStorage.setItem("chatapp_pending_username", username.trim());
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        if (!data.session) {
          setError("Account created! Check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went bananas.";
      setError(
        /rate limit/i.test(raw)
          ? "🍌 Too many signup emails were sent from this project recently — the email limit is temporarily maxed out. Wait an hour and try again, or turn off email confirmation in your backend auth settings."
          : raw,
      );
    } finally {
      setBusy(false);
    }
  }


  return (
    <div
      className={`relative flex min-h-screen items-center justify-center p-4 ${backgroundUrl ? "" : "jungle-emoji-bg"}`}
      style={
        backgroundUrl
          ? {
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {backgroundUrl && <div className="absolute inset-0 bg-bark/45" />}
      <form
        onSubmit={onSubmit}
        className="card-bubbly relative w-full max-w-sm space-y-4 p-6"
      >
        <div className="text-center">
          <div className="text-5xl">🐵</div>
          <h1 className="mt-1 text-3xl font-extrabold text-bark">Monkey Chat</h1>
          <p className="text-sm text-muted-foreground">Swing in and start chatting 🍌</p>
        </div>

        {mode === "signup" && (
          <Field
            label="Monkey name"
            value={username}
            onChange={setUsername}
            placeholder="banana_king"
          />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@jungle.com"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
        />

        {error && (
          <p className="rounded-xl border-2 border-bark bg-mango/30 px-3 py-2 text-sm font-semibold text-bark">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full border-[3px] border-bark bg-banana px-4 py-3 text-lg font-extrabold text-bark transition-transform active:translate-y-1 disabled:opacity-60"
          style={{ boxShadow: "var(--shadow-bubbly)" }}
        >
          {busy ? "Swinging..." : mode === "signin" ? "🍌 Sign in" : "🌴 Create account"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="w-full text-sm font-semibold text-jungle underline"
        >
          {mode === "signin" ? "New here? Join the troop" : "Already a monkey? Sign in"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-bark">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border-[3px] border-bark bg-cream px-4 py-2.5 text-base text-foreground outline-none focus:border-jungle"
      />
    </label>
  );
}
