import type { NextConfig } from "next";
import { ProvidePlugin, DefinePlugin } from "webpack";

const nextConfig: NextConfig = {
  // Add COOP/COEP headers required for WASM threads (SharedArrayBuffer)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    // Only apply polyfills for client-side builds
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        http: require.resolve("stream-http"),
        https: require.resolve("https-browserify"),
        zlib: require.resolve("browserify-zlib"),
        url: require.resolve("url"),
        buffer: require.resolve("buffer"),
        process: require.resolve("process/browser"),
        fs: false,
        net: false,
        tls: false,
      };

      // Provide global polyfills for browser compatibility
      config.plugins.push(
        new ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        }),
        // Define global = globalThis for libraries expecting Node.js global
        new DefinePlugin({
          "global": "globalThis",
        })
      );
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      'react-native': false,
    };

    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
