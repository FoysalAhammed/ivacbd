"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";

interface License {
  id: string;
  keyMasked: string;
  customerName: string;
  planName: string;
  status: string;
  maxDevices: number;
  activeDeviceCount: number;
  daysLeft: number;
  expiresAt: string;
  note: string | null;
}
interface Device {
  installationId: string;
  status: string;
  extensionVersion: string | null;
  activatedAt: string;
  lastValidatedAt: string;
}
interface Plan { id: string; name: string; deviceLimit: number; price: number; durationDays: number }

const STATUSES = ["", "ACTIVE", "EXPIRED", "REVOKED", "BLOCKED", "SUSPENDED"];

export default function LicensesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<License[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    apiGet<{ licenses: License[] }>(`/api/admin/licenses?${qs.toString()}`)
      .then((d) => setRows(d.licenses))
      .catch((err) => { if (err instanceof ApiError && err.status === 401) router.replace("/admin/login"); })
      .finally(() => setLoading(false));
  }, [search, status, router]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="stack">
      <div className="row spread wrap">
        <h2 style={{ margin: 0 }}>Licenses</h2>
        <button className="btn sm" onClick={() => setCreating(true)}>+ Create license</button>
      </div>

      <div className="row wrap" style={{ gap: 10 }}>
        <input className="grow" placeholder="Search key / customer / plan…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 180 }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No licenses found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Key</th><th>Customer</th><th>Plan</th><th>Status</th><th>Devices</th><th>Days left</th><th>Expires</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.keyMasked}</td>
                  <td>{l.customerName}</td>
                  <td>{l.planName}</td>
                  <td><span className={`badge ${l.status}`}>{l.status}</span></td>
                  <td>{l.activeDeviceCount}/{l.maxDevices}</td>
                  <td>{l.daysLeft}</td>
                  <td className="muted">{new Date(l.expiresAt).toLocaleDateString()}</td>
                  <td><button className="btn ghost sm" onClick={() => setOpenId(l.id)}>Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <LicenseDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      {creating && <CreateLicenseModal onClose={() => setCreating(false)} onDone={load} />}
    </div>
  );
}

function LicenseDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [license, setLicense] = useState<License | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState("30");
  const [limit, setLimit] = useState("");
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    apiGet<{ license: License; devices: Device[] }>(`/api/admin/licenses/${id}`)
      .then((d) => { setLicense(d.license); setDevices(d.devices); })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Load failed"));
  }, [id]);

  useEffect(load, [load]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/admin/licenses/${id}`, body);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(installationId: string) {
    setBusy(true);
    try {
      await apiPost("/api/admin/devices/deactivate", { licenseId: id, installationId });
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not deactivate");
    } finally {
      setBusy(false);
    }
  }

  async function revealKey() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiGet<{ key: string }>(`/api/admin/licenses/${id}/key`);
      setFullKey(res.key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reveal key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {!license ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="stack">
            <div className="row spread">
              <h3 style={{ margin: 0 }}>{license.keyMasked}</h3>
              <span className={`badge ${license.status}`}>{license.status}</span>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {license.customerName} · {license.planName} · {license.activeDeviceCount}/{license.maxDevices} devices · {license.daysLeft} days left
            </p>

            {fullKey ? (
              <div className="stack" style={{ gap: 6 }}>
                <div className="pill-key">{fullKey}</div>
                <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(fullKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
                  {copied ? "Copied ✓" : "Copy full key"}
                </button>
              </div>
            ) : (
              <button className="btn ghost sm" disabled={busy} onClick={revealKey} style={{ alignSelf: "start" }}>
                Reveal full key
              </button>
            )}

            {error && <div className="notice err">{error}</div>}

            <div className="row wrap" style={{ gap: 8 }}>
              {license.status !== "ACTIVE" && <button className="btn sm" disabled={busy} onClick={() => act({ action: "reactivate" })}>Reactivate</button>}
              {license.status !== "SUSPENDED" && <button className="btn ghost sm" disabled={busy} onClick={() => act({ action: "suspend" })}>Suspend</button>}
              {license.status !== "BLOCKED" && <button className="btn ghost sm" disabled={busy} onClick={() => act({ action: "block" })}>Block</button>}
              {license.status !== "REVOKED" && <button className="btn danger sm" disabled={busy} onClick={() => act({ action: "revoke" })}>Revoke</button>}
              <button className="btn ghost sm" disabled={busy} onClick={() => act({ action: "resetDevices" })}>Reset devices</button>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <div className="field grow"><label>Extend by days</label><input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" /></div>
              <button className="btn sm" disabled={busy || !days} onClick={() => act({ action: "extend", days: Number(days) })} style={{ alignSelf: "end" }}>Extend</button>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow"><label>Set device limit</label><input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={String(license.maxDevices)} inputMode="numeric" /></div>
              <button className="btn sm" disabled={busy || !limit} onClick={() => act({ action: "setDeviceLimit", maxDevices: Number(limit) })} style={{ alignSelf: "end" }}>Set</button>
            </div>

            <hr className="sep" />
            <h4 style={{ margin: 0 }}>Devices</h4>
            {devices.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No devices activated yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Installation</th><th>Status</th><th>Last check</th><th></th></tr></thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.installationId}>
                        <td className="mono" style={{ fontSize: 12 }}>{d.installationId.slice(0, 8)}…</td>
                        <td><span className={`badge ${d.status}`}>{d.status}</span></td>
                        <td className="muted">{new Date(d.lastValidatedAt).toLocaleDateString()}</td>
                        <td>{d.status === "ACTIVE" && <button className="btn ghost sm" disabled={busy} onClick={() => deactivate(d.installationId)}>Deactivate</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="btn ghost block" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateLicenseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ customerName: "", phone: "", whatsapp: "", planId: "", durationDays: "", maxDevices: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiGet<{ plans: Plan[] }>("/api/admin/plans").then((d) => {
      const active = d.plans;
      setPlans(active);
      if (active[0]) setForm((f) => ({ ...f, planId: active[0]!.id }));
    }).catch(() => {});
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { customerName: form.customerName, phone: form.phone, planId: form.planId };
      if (form.whatsapp) body.whatsapp = form.whatsapp;
      if (form.durationDays) body.durationDays = Number(form.durationDays);
      if (form.maxDevices) body.maxDevices = Number(form.maxDevices);
      const res = await apiPost<{ plaintextKey: string }>("/api/admin/licenses", body);
      setKey(res.plaintextKey);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create license.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {key ? (
          <div className="stack">
            <h3>License created ✓</h3>
            <p className="muted">Activation key — copy it now. You can also re-reveal it later from <strong>Manage → Reveal full key</strong>.</p>
            <div className="pill-key">{key}</div>
            <button className="btn block" onClick={() => { navigator.clipboard?.writeText(key).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
              {copied ? "Copied ✓" : "Copy key"}
            </button>
            <button className="btn ghost block" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div className="stack">
            <h3>Create license</h3>
            <div className="field"><label>Customer name</label><input value={form.customerName} onChange={set("customerName")} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={set("phone")} placeholder="017XXXXXXXX" /></div>
            <div className="field"><label>WhatsApp (optional)</label><input value={form.whatsapp} onChange={set("whatsapp")} placeholder="017XXXXXXXX" /></div>
            <div className="field"><label>Plan</label>
              <select value={form.planId} onChange={set("planId")}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ৳{p.price} / {p.durationDays}d / {p.deviceLimit} dev</option>)}
              </select>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow"><label>Duration override</label><input value={form.durationDays} onChange={set("durationDays")} placeholder="plan default" inputMode="numeric" /></div>
              <div className="field grow"><label>Device limit override</label><input value={form.maxDevices} onChange={set("maxDevices")} placeholder="plan default" inputMode="numeric" /></div>
            </div>
            {error && <div className="notice err">{error}</div>}
            <button className="btn block" disabled={busy || !form.planId} onClick={create}>{busy ? "Creating…" : "Create license"}</button>
            <button className="btn ghost block" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
