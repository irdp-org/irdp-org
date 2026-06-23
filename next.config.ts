import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // Server Actions default to a 1MB body limit, which silently rejects
      // any real photo attached to the leave-cert upload (HEIC from an
      // iPhone camera is routinely several MB). Match the leave-certs
      // bucket's actual file_size_limit (10MB, see 0002_storage.sql).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
