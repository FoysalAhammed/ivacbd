"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [form, setForm] = useState({ username: "", password: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await apiPost("/api/admin/login", { username: form.username, password: form.password });
      } else {
        await apiPost("/api/admin/bootstrap", {
          token: form.token,
          username: form.username,
          password: form.password,
        });
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 90 }}>
      <div className="card pad-lg stack">
        <div className="center stack">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent)", margin: "0 auto" }} />
          <h2 style={{ margin: 0 }}>Admin {mode === "bootstrap" ? "setup" : "sign in"}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {mode === "bootstrap" ? "Create the first administrator account." : "Sign in to manage licenses and payments."}
          </p>
        </div>

        <form className="stack" onSubmit={submit}>
          {mode === "bootstrap" && (
            <div className="field">
              <label>Bootstrap token</label>
              <input value={form.token} onChange={set("token")} required placeholder="ADMIN_BOOTSTRAP_TOKEN" />
            </div>
          )}
          <div className="field">
            <label>Username</label>
            <input value={form.username} onChange={set("username")} required autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={set("password")} required autoComplete={mode === "bootstrap" ? "new-password" : "current-password"} />
          </div>

          {error && <div className="notice err">{error}</div>}

          <button className="btn block" disabled={busy}>
            {busy ? "Please wait…" : mode === "bootstrap" ? "Create admin" : "Sign in"}
          </button>
        </form>

        <button
          className="btn ghost block sm"
          onClick={() => {
            setMode((m) => (m === "login" ? "bootstrap" : "login"));
            setError(null);
          }}
        >
          {mode === "login" ? "First-time setup (create admin)" : "Back to sign in"}
        </button>
      </div>
    </main>
  );
}
