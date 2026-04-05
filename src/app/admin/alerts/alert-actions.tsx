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

export function AlertRuleActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState("success_rate_below");
  const [threshold, setThreshold] = useState("");
  const [windowMinutes, setWindowMinutes] = useState("1440");
  const [tribe, setTribe] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      name: name.trim(),
      rule_type: ruleType,
      threshold: parseFloat(threshold),
      window_minutes: parseInt(windowMinutes, 10),
      channels: ["in_app"],
    };
    if (tribe.trim()) body.tribe = tribe.trim();

    try {
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? "Failed to create alert rule.");
        return;
      }

      setOpen(false);
      setName("");
      setThreshold("");
      setTribe("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const thresholdPlaceholder =
    ruleType === "success_rate_below" ? "e.g. 85 (for 85%)" :
    ruleType === "failed_run_count_above" ? "e.g. 5 (failures)" :
    "e.g. 300 (seconds)";

  return (
    <>
      <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 size-3.5" />
        New Alert
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Alert Rule</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="alert-name">Name</Label>
              <Input
                id="alert-name"
                placeholder="Low success rate alert"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ruleType">Rule Type</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v ?? "success_rate_below")}>
                <SelectTrigger id="ruleType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success_rate_below">Success Rate Below (%)</SelectItem>
                  <SelectItem value="failed_run_count_above">Failed Run Count Above</SelectItem>
                  <SelectItem value="duration_above">Avg Duration Above (seconds)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="threshold">Threshold</Label>
                <Input
                  id="threshold"
                  type="number"
                  placeholder={thresholdPlaceholder}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="window">Window (minutes)</Label>
                <Input
                  id="window"
                  type="number"
                  placeholder="1440"
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tribe">Tribe (optional — leave blank for global)</Label>
              <Input
                id="tribe"
                placeholder="cicd"
                value={tribe}
                onChange={(e) => setTribe(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !threshold}>
                {loading ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
