"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Policy = { id: string; name: string; is_enabled: boolean };
type PolicyActionsProps = { policies: Policy[] };

export function PolicyActions({ policies: _policies }: PolicyActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState("block_environment");
  const [tribe, setTribe] = useState("");
  const [repository, setRepository] = useState("");
  const [environment, setEnvironment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      name: name.trim(),
      ruleType,
    };
    if (tribe.trim()) body.tribe = tribe.trim();
    if (repository.trim()) body.repository = repository.trim();
    if (environment) body.environment = environment;

    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? "Failed to create policy.");
        return;
      }

      setOpen(false);
      setName("");
      setRuleType("block_environment");
      setTribe("");
      setRepository("");
      setEnvironment("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 size-3.5" />
        New Policy
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Policy Rule</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Block direct main deployments"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ruleType">Rule Type</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v ?? "block_environment")}>
                <SelectTrigger id="ruleType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block_environment">Block Environment</SelectItem>
                  <SelectItem value="block_status">Block Status</SelectItem>
                  <SelectItem value="require_summary_on_status">Require Summary on Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tribe">Tribe (optional)</Label>
                <Input
                  id="tribe"
                  placeholder="cicd"
                  value={tribe}
                  onChange={(e) => setTribe(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="environment">Environment (optional)</Label>
                <Select value={environment} onValueChange={(v) => setEnvironment(v ?? "")}>
                  <SelectTrigger id="environment">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="uat">UAT</SelectItem>
                    <SelectItem value="main">Main</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="repository">Repository (optional)</Label>
              <Input
                id="repository"
                placeholder="org/repo"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
