import { redirect } from "next/navigation";
import { getAdminSession } from "@/server/auth/admin";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div>
      <AdminNav username={session.username} />
      <div className="container" style={{ padding: "28px 20px 60px" }}>
        {children}
      </div>
    </div>
  );
}
