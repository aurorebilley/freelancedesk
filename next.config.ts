import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  ...(process.env.FREELANCEDESK_TEST_DIST_DIR === "1" ? { distDir: ".next/emulator" } : {}),
};

export default config;
