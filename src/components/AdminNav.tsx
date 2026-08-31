"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/licenses", label: "Licenses" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/audit", label: "Audit" },
];

export default function AdminNav({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await apiPost("/api/admin/logout").catch(() => {});
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <nav
      className="row spread"
      style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div className="row wrap" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 8, marginRight: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--accent)" }} />
          <strong>IVAC Admin</strong>
        </div>
        {LINKS.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "btn sm" : "btn ghost sm"}
              style={active ? undefined : { border: "none" }}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="row" style={{ gap: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>{username}</span>
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </div>
    </nav>
  );
}
