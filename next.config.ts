import type { NextConfig } from "next";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseHostingDomain = `${projectId}.firebaseapp.com`;

const config: NextConfig = {
  agentRules: false,
  ...(process.env.FREELANCEDESK_TEST_DIST_DIR === "1" ? { distDir: ".next/emulator" } : {}),
  async rewrites() {
    if (!projectId || !/^[a-z0-9-]+$/.test(projectId) || !authDomain || authDomain === firebaseHostingDomain ||
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL) return [];

    return [{ source: "/__/auth/:path*", destination: `https://${firebaseHostingDomain}/__/auth/:path*` }];
  },
};

export default config;
