import { z } from "zod";

export const deploymentStatuses = [
  "queued",
  "running",
  "success",
  "failed",
  "cancelled",
] as const;

export const deploymentEnvironments = ["test", "uat", "main"] as const;

export type DeploymentStatus = (typeof deploymentStatuses)[number];
export type DeploymentEnvironment = (typeof deploymentEnvironments)[number];

export interface Deployment {
  id: string;
  repository: string;
  branch: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  summary: string | null;
  commit_sha: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export const createDeploymentSchema = z.object({
  repository: z.string().min(2).max(120),
  branch: z.string().min(1).max(120),
  environment: z.enum(deploymentEnvironments),
  status: z.enum(deploymentStatuses).default("queued"),
  summary: z.string().max(500).optional(),
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, "Commit SHA must be 7 to 40 hex chars")
    .optional(),
  durationSeconds: z.number().int().min(0).max(172800).optional(),
});

export const updateDeploymentSchema = z.object({
  status: z.enum(deploymentStatuses).optional(),
  summary: z.string().max(500).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(172800).nullable().optional(),
});
