/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// CSP: no third-party scripts; inline styles are required by Next/Tailwind;
// data:/blob: images for QR data-URLs and previews; Google fonts stylesheets.
// Same-origin framing is allowed so authenticated JUN PDF previews can render
// inside internal tools such as the visual signature field editor. External
// origins still cannot frame JUN.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  optimizeFonts: false, // fonts load via <link>; avoids build-time fetch to Google

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async redirects() {
    // Canonical host: juncreatif.org → www.juncreatif.org (Vercel also handles this at the domain level)
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "juncreatif.org" }],
        destination: "https://www.juncreatif.org/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
