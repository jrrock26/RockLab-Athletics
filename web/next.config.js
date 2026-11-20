/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so `firebase deploy --only hosting` serves it from web/out.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
