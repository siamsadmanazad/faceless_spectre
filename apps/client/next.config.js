/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only for production (Cloudflare Pages). In dev, dynamic
  // routes are served normally so real room IDs don't need to be pre-declared.
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  transpilePackages: ['@faceless-spectre/shared'],
  images: { unoptimized: true },
};

module.exports = nextConfig;
