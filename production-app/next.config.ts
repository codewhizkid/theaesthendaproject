import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.AESTHENDA_STAGING === "1" ? ".next-staging" : ".next",
};

export default nextConfig;
