"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, ApiError } from "@/lib/api";

export default function OtpSettingsPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ allowedSender: string }>("/api/admin/otp-settings")
      .then((d) => { setValue(d.allowedSender); setSaved(d.allowedSender); })
      .catch((err) => { if (err instanceof ApiError && err.status === 401) router.replace("/admin/login"); })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(load, [load]);

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const d = await apiPatch<{ allowedSender: string }>("/api/admin/otp-settings", { allowedSender: value.trim() });
      setValue(d.allowedSender);
      setSaved(d.allowedSender);
      setNote({ kind: "ok", text: "Saved. Apps pick this up on next login or refresh." });
    } catch (err) {
      setNote({ kind: "err", text: err instanceof ApiError ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h2 style={{ margin: 0 }}>OTP Relay</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        The mobile OTP app only forwards an SMS when its sender matches this value
        (and the body matches the IVAC OTP format). Change it here without shipping a
        new app. Leave it empty to accept any sender.
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="field">
            <label>Allowed SMS sender</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. IVACBD"
              maxLength={40}
            />
          </div>
          {note && <div className={`notice ${note.kind === "ok" ? "" : "err"}`}>{note.text}</div>}
          <button className="btn" disabled={busy || value.trim() === saved.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      )}
    </div>
  );
}
