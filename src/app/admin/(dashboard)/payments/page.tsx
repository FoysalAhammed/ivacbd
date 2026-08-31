"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";

interface Purchase {
  id: string;
  customerName: string;
  phone: string;
  whatsapp: string | null;
  planName: string;
  amount: number;
  senderBkashNumber: string;
  transactionId: string;
  status: string;
  submittedAt: string;
  rejectedReason: string | null;
  licenseId: string | null;
}

const FILTERS = [
  { key: "PENDING_VERIFICATION", label: "Pending" },
  { key: "VERIFIED", label: "Verified" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];

export default function PaymentsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState("PENDING_VERIFICATION");
  const [rows, setRows] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<{ mode: "verify" | "reject"; p: Purchase } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ purchases: Purchase[] }>(`/api/admin/payments${filter ? `?status=${filter}` : ""}`)
      .then((d) => setRows(d.purchases))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/admin/login");
      })
      .finally(() => setLoading(false));
  }, [filter, router]);

  useEffect(load, [load]);

  return (
    <div className="stack">
      <h2>Payments</h2>
      <div className="row wrap">
        {FILTERS.map((f) => (
          <button key={f.label} className={filter === f.key ? "btn sm" : "btn ghost sm"} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No payment requests here.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th><th>Plan</th><th>Amount</th><th>Sender bKash</th>
                <th>TrxID</th><th>Status</th><th>Submitted</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.customerName}
                    <div className="muted mono" style={{ fontSize: 12 }}>{p.phone}</div>
                  </td>
                  <td>{p.planName}</td>
                  <td>৳{p.amount.toLocaleString()}</td>
                  <td className="mono">{p.senderBkashNumber}</td>
                  <td className="mono">{p.transactionId}</td>
                  <td><span className={`badge ${p.status}`}>{p.status.replace("_", " ")}</span></td>
                  <td className="muted">{new Date(p.submittedAt).toLocaleString()}</td>
                  <td>
                    {p.status === "PENDING_VERIFICATION" && (
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn sm" onClick={() => setActive({ mode: "verify", p })}>Verify</button>
                        <button className="btn ghost sm" onClick={() => setActive({ mode: "reject", p })}>Reject</button>
                      </div>
                    )}
                    {p.status === "REJECTED" && p.rejectedReason && (
                      <span className="muted" style={{ fontSize: 12 }}>{p.rejectedReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active?.mode === "verify" && (
        <VerifyModal purchase={active.p} onClose={() => setActive(null)} onDone={load} />
      )}
      {active?.mode === "reject" && (
        <RejectModal purchase={active.p} onClose={() => setActive(null)} onDone={load} />
      )}
    </div>
  );
}

function VerifyModal({ purchase, onClose, onDone }: { purchase: Purchase; onClose: () => void; onDone: () => void }) {
  const [durationDays, setDurationDays] = useState("");
  const [maxDevices, setMaxDevices] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; keyMasked: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (durationDays) body.durationDays = Number(durationDays);
      if (maxDevices) body.maxDevices = Number(maxDevices);
      if (startDate) body.startDate = startDate;
      const res = await apiPost<{ plaintextKey: string; license: { expiresAt: string } }>(
        `/api/admin/payments/${purchase.id}/verify`,
        body,
      );
      setResult({ key: res.plaintextKey, keyMasked: "", expiresAt: res.license.expiresAt });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <div className="stack">
            <h3>License created ✓</h3>
            <p className="muted">Give this activation key to <strong>{purchase.customerName}</strong>. It is shown only once.</p>
            <div className="pill-key">{result.key}</div>
            <button
              className="btn block"
              onClick={() => {
                navigator.clipboard?.writeText(result.key).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Copied ✓" : "Copy key"}
            </button>
            <p className="muted" style={{ fontSize: 13 }}>Expires {new Date(result.expiresAt).toLocaleDateString()}</p>
            <button className="btn ghost block" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div className="stack">
            <h3>Verify payment</h3>
            <div className="notice" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div><strong>{purchase.customerName}</strong> · {purchase.phone}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {purchase.planName} · ৳{purchase.amount.toLocaleString()} · TrxID <span className="mono">{purchase.transactionId}</span> from <span className="mono">{purchase.senderBkashNumber}</span>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Confirm you found this bKash transaction. Overrides are optional (defaults come from the plan).
            </p>
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow"><label>Duration (days)</label><input value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="plan default" inputMode="numeric" /></div>
              <div className="field grow"><label>Device limit</label><input value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} placeholder="plan default" inputMode="numeric" /></div>
            </div>
            <div className="field"><label>Start date (optional)</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            {error && <div className="notice err">{error}</div>}
            <button className="btn block" disabled={busy} onClick={confirm}>
              {busy ? "Creating license…" : "Confirm & create license"}
            </button>
            <button className="btn ghost block" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

function RejectModal({ purchase, onClose, onDone }: { purchase: Purchase; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/admin/payments/${purchase.id}/reject`, { reason: reason || undefined });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="stack">
          <h3>Reject payment</h3>
          <p className="muted">Rejecting the request from <strong>{purchase.customerName}</strong>. No license will be created.</p>
          <div className="field"><label>Reason (optional, shown internally)</label><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. transaction not found" /></div>
          {error && <div className="notice err">{error}</div>}
          <button className="btn danger block" disabled={busy} onClick={confirm}>{busy ? "Rejecting…" : "Reject payment"}</button>
          <button className="btn ghost block" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
