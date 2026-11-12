import path from 'node:path';

// PAGES=1 builds the static, offline-capable version for GitHub Pages
// (npm run build:pages). Without it this is the normal server build.
const isPages = process.env.PAGES === '1';
const basePath = isPages ? (process.env.PAGES_BASE_PATH ?? '/Kurukshetra-gym') : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // From next.config.mjs:
  typescript: {
    // TODO: Fix these build errors to avoid ignoring them
    ignoreBuildErrors: true, // Kept from .mjs as it might be helping server start
  },
  eslint: {
    ignoreDuringBuilds: true, // Kept from .mjs
  },
  allowedDevOrigins: ['https://9003-firebase-studio-1747296148833.cluster-ys234awlzbhwoxmkkse6qo3fz6.cloudworkstations.dev', 'http://9003-firebase-studio-1747296148833.cluster-ys234awlzbhwoxmkkse6qo3fz6.cloudworkstations.dev'], // Kept from .mjs

  ...(isPages ? { output: 'export', basePath, trailingSlash: true } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_OFFLINE: isPages ? '1' : '',
  },

  images: {
    unoptimized: isPages, // no image optimisation server on static hosting
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      // If you add more image sources, also add them to your tsconfig.json if needed.
      // e.g., { protocol: 'https', hostname: 'firebasestorage.googleapis.com' } for Firebase Storage
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Don't resolve server-only modules on the client
      config.resolve.fallback = {
        ...config.resolve.fallback, // Spread existing fallbacks if any
        fs: false,
        net: false,
        tls: false,
      };
    }
    if (isPages) {
      // Static hosting cannot run the server actions in src/actions, so the Pages
      // build uses the on-device versions in src/local (same function names).
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^@\/actions\/(member|forum)-actions$/, (resource) => {
          const name = resource.request.replace('@/actions/', '');
          resource.request = path.resolve('src/local', `${name}.ts`);
        })
      );
    }
    return config;
  },
};

export default nextConfig;
