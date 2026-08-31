"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";

interface Customer { id: string; name: string; phone: string; whatsapp: string | null; createdAt: string }
interface CustLicense { id: string; keyMasked: string; planName: string; status: string; daysLeft: number; expiresAt: string }

export default function CustomersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ customers: Customer[] }>(`/api/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`)
      .then((d) => setRows(d.customers))
      .catch((err) => { if (err instanceof ApiError && err.status === 401) router.replace("/admin/login"); })
      .finally(() => setLoading(false));
  }, [search, router]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="stack">
      <h2>Customers</h2>
      <input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No customers found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>WhatsApp</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="mono">{c.phone}</td>
                  <td className="mono">{c.whatsapp || "—"}</td>
                  <td className="muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td><button className="btn ghost sm" onClick={() => setOpenId(c.id)}>Licenses</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <CustomerModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CustomerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<{ customer: Customer; licenses: CustLicense[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ customer: Customer; licenses: CustLicense[] }>(`/api/admin/customers/${id}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Load failed"));
  }, [id]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        {error ? (
          <div className="notice err">{error}</div>
        ) : !data ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="stack">
            <h3 style={{ margin: 0 }}>{data.customer.name}</h3>
            <p className="muted mono" style={{ margin: 0 }}>{data.customer.phone}{data.customer.whatsapp ? ` · ${data.customer.whatsapp}` : ""}</p>
            <hr className="sep" />
            <h4 style={{ margin: 0 }}>Licenses</h4>
            {data.licenses.length === 0 ? (
              <p className="muted">No licenses.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Key</th><th>Plan</th><th>Status</th><th>Days</th></tr></thead>
                  <tbody>
                    {data.licenses.map((l) => (
                      <tr key={l.id}>
                        <td className="mono">{l.keyMasked}</td>
                        <td>{l.planName}</td>
                        <td><span className={`badge ${l.status}`}>{l.status}</span></td>
                        <td>{l.daysLeft}</td>
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
