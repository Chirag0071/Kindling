/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      // Prevents "Array buffer allocation failed" on memory-constrained
      // machines - webpack's persistent disk cache needs a large buffer
      // allocation that can fail under memory pressure. Costs a bit of
      // rebuild speed, but nothing breaks either way.
      config.cache = false;
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" }, // local dev backend
      { protocol: "https", hostname: "**.amazonaws.com" },   // AWS S3
      { protocol: "https", hostname: "**.onrender.com" },     // backend-served local media
      { protocol: "https", hostname: "**.r2.dev" },           // Cloudflare R2 default public domain
      { protocol: "https", hostname: "**.backblazeb2.com" },  // Backblaze B2
      { protocol: "https", hostname: "**.digitaloceanspaces.com" }, // DigitalOcean Spaces
      // Using a custom domain for your bucket instead (e.g. media.yourapp.com)?
      // Add it here too - Next.js Image only optimizes images from explicitly
      // allowlisted domains, as a security measure against SSRF-style abuse.
    ],
  },
};

module.exports = nextConfig;
