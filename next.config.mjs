/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The MongoDB driver is a server-only dependency; keep it external so Next
  // never tries to bundle it into an edge/client chunk. (Next 14 key.)
  experimental: {
    serverComponentsExternalPackages: ["mongodb"],
  },
  async headers() {
    return [
      {
        // The license + purchase APIs are called cross-origin (from the
        // extension and, for /plans, potentially other pages). Lock CORS down
        // to the methods we use; per-route handlers echo an allow-list origin.
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
