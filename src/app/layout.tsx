import "./globals.css";
import type { Metadata } from "next";

const PRODUCT = process.env.NEXT_PUBLIC_PRODUCT_NAME || "IVAC Slot Automation Pro";

export const metadata: Metadata = {
  title: PRODUCT,
  description:
    "Automate IVAC appointment slot booking — continuous date retry, Cloudflare handling, and reliable file upload. Licensed per device.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
