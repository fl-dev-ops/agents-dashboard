import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default withWorkflow(nextConfig);
