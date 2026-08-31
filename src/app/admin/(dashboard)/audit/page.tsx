"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export default function AuditPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ logs: AuditRow[] }>("/api/admin/audit")
      .then((d) => setRows(d.logs))
      .catch((err) => { if (err instanceof ApiError && err.status === 401) router.replace("/admin/login"); })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="stack">
      <h2>Audit log</h2>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
                  <td><span className="badge">{r.action}</span></td>
                  <td className="muted">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ""}</td>
                  <td className="muted mono" style={{ fontSize: 12, whiteSpace: "normal", maxWidth: 340 }}>
                    {r.metadata ? JSON.stringify(r.metadata) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
