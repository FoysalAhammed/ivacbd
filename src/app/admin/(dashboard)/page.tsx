"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";

interface Stats {
  totalCustomers: number;
  activeLicenses: number;
  expiredLicenses: number;
  pendingPayments: number;
  activeDevices: number;
  revenue: number;
}

const CARDS: { key: keyof Stats; label: string; fmt?: (n: number) => string }[] = [
  { key: "totalCustomers", label: "Total customers" },
  { key: "activeLicenses", label: "Active licenses" },
  { key: "expiredLicenses", label: "Expired licenses" },
  { key: "pendingPayments", label: "Pending payments" },
  { key: "activeDevices", label: "Active devices" },
  { key: "revenue", label: "Revenue (verified)", fmt: (n) => `৳${n.toLocaleString()}` },
];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ stats: Stats }>("/api/admin/stats")
      .then((d) => setStats(d.stats))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/admin/login");
        else setError("Could not load dashboard.");
      });
  }, [router]);

  return (
    <div className="stack">
      <h2>Dashboard</h2>
      {error && <div className="notice err">{error}</div>}
      {!stats ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="grid-cards">
          {CARDS.map((c) => (
            <div key={c.key} className="card">
              <div className="stat-value">{c.fmt ? c.fmt(stats[c.key]) : stats[c.key]}</div>
              <div className="stat-label">{c.label}</div>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 13 }}>
        Verify new bKash payments under <strong>Payments</strong>. Days-left, device counts, and
        revocation live under <strong>Licenses</strong>.
      </p>
    </div>
  );
}
