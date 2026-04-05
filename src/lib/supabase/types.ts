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
  tribe: string | null;
  branch: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  summary: string | null;
  commit_sha: string | null;
  run_id: number | null;
  run_attempt: number | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface RepoTribeMap {
  repository: string;
  tribe: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserTribeMembership {
  id: string;
  user_id: string;
  tribe: string;
  role: "viewer" | "lead" | "platform_admin";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  repository: string;
  run_id: number;
  run_attempt: number;
  workflow_name: string | null;
  branch: string;
  environment: DeploymentEnvironment;
  tribe: string;
  status: DeploymentStatus;
  github_status: string | null;
  github_conclusion: string | null;
  event_name: string;
  action: string | null;
  run_url: string | null;
  commit_sha: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowJob {
  id: string;
  repository: string;
  run_id: number;
  run_attempt: number;
  job_id: number;
  name: string;
  tribe: string;
  branch: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  github_status: string | null;
  github_conclusion: string | null;
  run_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  rule_type: "block_environment" | "block_status" | "require_summary_on_status";
  repository: string | null;
  tribe: string | null;
  environment: DeploymentEnvironment | null;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  source: string;
  actor: string | null;
  actor_type: "system" | "user" | "webhook" | "sync";
  repository: string | null;
  tribe: string | null;
  branch: string | null;
  environment: DeploymentEnvironment | null;
  deployment_id: string | null;
  run_id: number | null;
  run_attempt: number | null;
  details: Record<string, unknown>;
  created_at: string;
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
