"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";

interface Plan {
  id: string;
  name: string;
  deviceLimit: number;
  price: number;
  durationDays: number;
  active: boolean;
}

export default function PlansPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ plans: Plan[] }>("/api/admin/plans")
      .then((d) => setRows(d.plans))
      .catch((err) => { if (err instanceof ApiError && err.status === 401) router.replace("/admin/login"); })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(load, [load]);

  async function toggleActive(p: Plan) {
    await apiPatch(`/api/admin/plans/${p.id}`, { active: !p.active }).catch(() => {});
    load();
  }

  return (
    <div className="stack">
      <div className="row spread wrap">
        <h2 style={{ margin: 0 }}>Plans</h2>
        <button className="btn sm" onClick={() => setEditing("new")}>+ New plan</button>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Price</th><th>Duration</th><th>Devices</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>৳{p.price.toLocaleString()}</td>
                  <td>{p.durationDays} days</td>
                  <td>{p.deviceLimit}</td>
                  <td><span className={`badge ${p.active ? "ACTIVE" : "DEACTIVATED"}`}>{p.active ? "Active" : "Hidden"}</span></td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => setEditing(p)}>Edit</button>
                      <button className="btn ghost sm" onClick={() => toggleActive(p)}>{p.active ? "Hide" : "Show"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PlanModal plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={load} />}
    </div>
  );
}

function PlanModal({ plan, onClose, onDone }: { plan: Plan | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    price: String(plan?.price ?? ""),
    durationDays: String(plan?.durationDays ?? "30"),
    deviceLimit: String(plan?.deviceLimit ?? "1"),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        price: Number(form.price),
        durationDays: Number(form.durationDays),
        deviceLimit: Number(form.deviceLimit),
      };
      if (plan) await apiPatch(`/api/admin/plans/${plan.id}`, body);
      else await apiPost("/api/admin/plans", body);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="stack">
          <h3>{plan ? "Edit plan" : "New plan"}</h3>
          <div className="field"><label>Name</label><input value={form.name} onChange={set("name")} placeholder="e.g. 3 PC" /></div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field grow"><label>Price (৳)</label><input value={form.price} onChange={set("price")} inputMode="numeric" /></div>
            <div className="field grow"><label>Duration (days)</label><input value={form.durationDays} onChange={set("durationDays")} inputMode="numeric" /></div>
          </div>
          <div className="field"><label>Device limit</label><input value={form.deviceLimit} onChange={set("deviceLimit")} inputMode="numeric" /></div>
          {error && <div className="notice err">{error}</div>}
          <button className="btn block" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save plan"}</button>
          <button className="btn ghost block" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
