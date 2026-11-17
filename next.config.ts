import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // @resvg/resvg-js ships a native .node binding loaded at runtime — Turbopack
  // can't bundle that into an ESM chunk ("non-ecmascript placeable asset").
  // This tells Next to leave it as a real require() against node_modules on
  // the server instead of trying to bundle it (same reason sharp usually
  // needs this treatment).
  serverExternalPackages: ["@resvg/resvg-js"],
  experimental: {
    serverActions: {
      // Server Actions default to a 1MB body limit, which silently rejects
      // any real photo attached to the leave-cert upload (HEIC from an
      // iPhone camera is routinely several MB), and would be far too small
      // for the field-request evidence attachments (multiple photos, or a
      // short video clip) added later — 100MB covers a realistic phone
      // video clip without requiring a separate chunked-upload path.
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
