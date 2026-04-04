"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface FormState {
  repository: string;
  branch: string;
  environment: "test" | "uat" | "main";
  status: "queued" | "running" | "success" | "failed" | "cancelled";
  durationSeconds: string;
  commitSha: string;
  summary: string;
}

const initialState: FormState = {
  repository: "",
  branch: "",
  environment: "test",
  status: "queued",
  durationSeconds: "",
  commitSha: "",
  summary: "",
};

export function NewDeploymentForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repository: form.repository,
          branch: form.branch,
          environment: form.environment,
          status: form.status,
          durationSeconds: form.durationSeconds,
          commitSha: form.commitSha,
          summary: form.summary,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        setErrorMessage(payload.error ?? payload.details ?? "Unable to create deployment.");
        return;
      }

      setSuccessMessage("Deployment inserted successfully.");
      setForm(initialState);

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setErrorMessage("Unexpected network error while creating deployment.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Deployment</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="repository">Repository</Label>
            <Input
              id="repository"
              placeholder="central-workflow"
              required
              value={form.repository}
              onChange={(event) =>
                setForm((current) => ({ ...current, repository: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branch">Branch</Label>
            <Input
              id="branch"
              placeholder="test"
              required
              value={form.branch}
              onChange={(event) =>
                setForm((current) => ({ ...current, branch: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Environment</Label>
            <Select
              value={form.environment}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }

                setForm((current) => ({
                  ...current,
                  environment: value as FormState["environment"],
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="uat">UAT</SelectItem>
                <SelectItem value="main">Main</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }

                setForm((current) => ({
                  ...current,
                  status: value as FormState["status"],
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="duration">Duration (seconds)</Label>
            <Input
              id="duration"
              type="number"
              min={0}
              placeholder="245"
              value={form.durationSeconds}
              onChange={(event) =>
                setForm((current) => ({ ...current, durationSeconds: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="commit">Commit SHA</Label>
            <Input
              id="commit"
              placeholder="8df88ad"
              value={form.commitSha}
              onChange={(event) =>
                setForm((current) => ({ ...current, commitSha: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              placeholder="Maestro Android lane passed and promotion PR prepared."
              value={form.summary}
              onChange={(event) =>
                setForm((current) => ({ ...current, summary: event.target.value }))
              }
            />
          </div>

          <div className="md:col-span-2 flex flex-col gap-3">
            {errorMessage ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to create deployment</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {successMessage ? (
              <Alert>
                <AlertTitle>Saved</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Deployment"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
