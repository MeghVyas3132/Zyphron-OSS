import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.zyphron.space";
const APP_URL = (import.meta.env.VITE_APP_URL as string) || "https://app.zyphron.space";

const OAUTH_ERRORS: Record<string, string> = {
  github_denied: "GitHub authorization was denied",
  github_token_failed: "GitHub authentication failed — try again",
  github_failed: "GitHub login failed",
  google_denied: "Google authorization was denied",
  google_failed: "Google login failed",
  github_not_configured: "GitHub OAuth is not yet configured",
  google_not_configured: "Google OAuth is not yet configured",
};

async function initiateOAuth(provider: "github" | "google") {
  const res = await fetch(`${API_URL}/api/v1/auth/${provider}`);
  const data = await res.json() as { data?: { redirectUrl?: string }; error?: { message?: string } };
  if (!res.ok || !data?.data?.redirectUrl) throw new Error(data?.error?.message || `${provider} OAuth unavailable`);
  window.location.href = data.data.redirectUrl;
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.468-2.38 1.235-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .321.217.694.825.576C20.565 21.796 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z" />
      <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z" />
      <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

export function HoloTerminal() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);

  // Pick up ?error= param that OAuth callbacks redirect back with
  // Also stash cli_redirect in sessionStorage so it survives the OAuth dance
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(OAUTH_ERRORS[err] || `Authentication error: ${err}`);
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }
    const cliRedirect = params.get("cli_redirect");
    if (cliRedirect) {
      sessionStorage.setItem("zy_cli_redirect", cliRedirect);
    }
  }, []);

  const switchMode = (next: "login" | "register") => { setMode(next); setError(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
      const body: Record<string, string> = mode === "login" ? { email, password } : { name, email, password };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        type ApiErr = { error?: { code?: string; message?: string } | string; message?: string };
        const d = data as ApiErr;
        const raw = d?.error;
        setError(typeof raw === "string" ? raw : typeof raw === "object" && raw !== null ? (raw.message ?? "Authentication failed") : (d?.message ?? "Authentication failed"));
        return;
      }
      const token = (data as { data?: { token: string }; token?: string })?.data?.token || (data as { token?: string })?.token || "";
      if (!token) { setError("No token returned from server"); return; }
      const cliRedirect = sessionStorage.getItem("zy_cli_redirect");
      if (cliRedirect) {
        sessionStorage.removeItem("zy_cli_redirect");
        window.location.href = `${cliRedirect}?token=${encodeURIComponent(token)}`;
      } else {
        window.location.href = `${APP_URL}/?token=${encodeURIComponent(token)}`;
      }
    } catch {
      setError("Connection error — check your network");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "github" | "google") => {
    setError("");
    setOauthLoading(provider);
    try {
      await initiateOAuth(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth failed");
      setOauthLoading(null);
    }
  };

  const busy = loading || !!oauthLoading;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className="holo-panel scanlines relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl p-8"
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between font-mono-ui text-[10px] uppercase tracking-[0.3em] text-white/40">
        <span>// access.terminal</span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white/80" />
          secure channel
        </span>
      </div>

      {/* Sign in / Register toggle */}
      <div className="mb-6 flex gap-px overflow-hidden rounded-md border border-white/[0.08] font-mono-ui text-[9px] uppercase tracking-[0.25em]">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`flex-1 py-2 transition-colors ${mode === m ? "bg-white/[0.08] text-white/85" : "bg-transparent text-white/30 hover:text-white/50"}`}
          >
            {m === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <h3 className="mb-2 font-display text-2xl font-light text-white">
        {mode === "login" ? "Authenticate" : "Create access"}
      </h3>
      <p className="mb-7 font-mono-ui text-[11px] tracking-wider text-white/40">
        {mode === "login" ? "Entering the deployment intelligence network" : "Joining the deployment intelligence network"}
      </p>

      {/* OAuth */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {(["github", "google"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handleOAuth(p)}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white/85 disabled:opacity-40"
          >
            {oauthLoading === p
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/30 border-t-white/80" />
              : p === "github" ? <GithubIcon /> : <GoogleIcon />
            }
            {p === "github" ? "GitHub" : "Google"}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="font-mono-ui text-[9px] uppercase tracking-[0.25em] text-white/25">or</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      {/* Email / password form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <AnimatePresence initial={false}>
          {mode === "register" && (
            <motion.div key="name-field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
              <Field label="DISPLAY NAME" value={name} onChange={setName} placeholder="Your name" />
            </motion.div>
          )}
        </AnimatePresence>
        <Field label="OPERATOR ID" value={email} onChange={setEmail} placeholder="operator@zyphron.space" type="email" />
        <Field label="ACCESS KEY" value={password} onChange={setPassword} placeholder="••••••••••••••••" type="password" />

        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono-ui text-[10px] tracking-wider text-red-400/90">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="group mt-1 flex w-full items-center justify-between rounded-md border border-white/15 bg-white/[0.03] px-4 py-3 font-mono-ui text-[11px] uppercase tracking-[0.25em] text-white/85 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          <span>{loading ? "Establishing channel..." : mode === "login" ? "Initiate handshake" : "Create access token"}</span>
          <span className="text-white/40 group-hover:text-white/80">{loading ? "..." : "→"}</span>
        </button>
      </form>

      <div className="mt-8 grid grid-cols-3 gap-3 font-mono-ui text-[9px] uppercase tracking-[0.25em] text-white/30">
        <div>node: us-edge-04</div>
        <div>latency: 12ms</div>
        <div>integrity: 100%</div>
      </div>
    </motion.div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono-ui text-[9px] uppercase tracking-[0.3em] text-white/35">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required
        className="w-full border-b border-white/10 bg-transparent py-2 font-mono-ui text-sm text-white/90 outline-none placeholder:text-white/20 focus:border-white/50"
      />
    </label>
  );
}

export default HoloTerminal;
