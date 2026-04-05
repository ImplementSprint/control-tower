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
import type { RepoTribeMap } from "@/lib/supabase/types";

type TribeActionsProps = { tribes: RepoTribeMap[] };

export function TribeActions({ tribes: _tribes }: TribeActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repository, setRepository] = useState("");
  const [tribe, setTribe] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/tribes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: repository.trim(), tribe: tribe.trim() }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? "Failed to save mapping.");
        return;
      }

      setOpen(false);
      setRepository("");
      setTribe("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        className="rounded-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 size-3.5" />
        Add Mapping
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Tribe Mapping</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="repository">Repository</Label>
              <Input
                id="repository"
                placeholder="org/repo-name"
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tribe">Tribe</Label>
              <Input
                id="tribe"
                placeholder="cicd"
                value={tribe}
                onChange={(e) => setTribe(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
