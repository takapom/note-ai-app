import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  turbopack: {
    root: fileURLToPath(new URL('../../', import.meta.url)),
  },
  transpilePackages: [],
  webpack(config) {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/.next-*/**',
        '**/.next_*',
      ],
    };
    return config;
  },
};

export default nextConfig;
