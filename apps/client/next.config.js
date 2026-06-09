/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@faceless-spectre/shared'],
  images: { unoptimized: true },
};

module.exports = nextConfig;
