import type { FocusFilter } from "@/lib/dashboard/home-presenters";

type DashboardTab = "summary" | "runs" | "metrics";

type TribeSelectorProps = Readonly<{
  tribes: string[];
  selectedTribes: string[];
  tab: DashboardTab;
  focus: FocusFilter;
  clearHref: string;
}>;

function getUniqueSortedTribes(tribes: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const tribe of tribes) {
    const trimmed = tribe.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    values.push(trimmed);
  }

  return values.sort((a, b) => a.localeCompare(b));
}

function getTribeInputId(tribe: string) {
  return `tribe-filter-${tribe.replaceAll(/[^a-z0-9_-]/gi, "-")}`;
}

export function TribeSelector({
  tribes,
  selectedTribes,
  tab,
  focus,
  clearHref,
}: TribeSelectorProps) {
  const options = getUniqueSortedTribes(tribes);
  const selected = new Set(
    selectedTribes.map((tribe) => tribe.trim().toLowerCase()).filter((tribe) => tribe.length > 0),
  );

  if (options.length < 2) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">Filter Tribes</h2>
        <p className="text-xs text-muted-foreground">
          Select one or more tribes to focus the dashboard data.
        </p>
      </div>

      <form method="get" className="space-y-3">
        {tab === "summary" ? null : <input type="hidden" name="tab" value={tab} />}
        {focus === "all" ? null : <input type="hidden" name="focus" value={focus} />}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((tribe) => {
            const normalized = tribe.toLowerCase();
            const inputId = getTribeInputId(tribe);

            return (
              <label
                key={normalized}
                htmlFor={inputId}
                className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-foreground"
              >
                <input
                  id={inputId}
                  type="checkbox"
                  name="tribes"
                  value={normalized}
                  defaultChecked={selected.has(normalized)}
                  className="size-4 rounded border-border text-foreground"
                />
                <span>{tribe}</span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-full border border-border/70 bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:opacity-90"
          >
            Apply Tribes
          </button>
          <a
            href={clearHref}
            className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Clear
          </a>
        </div>
      </form>
    </section>
  );
}
