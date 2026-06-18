import { redirect } from "next/navigation";
import {
  getSelectedTribes,
  hasTribeFilterParam,
  HomeDashboard,
  normalizeFocusFilter,
  normalizeTab,
} from "@/components/dashboard/home-dashboard";
import { getAuthenticatedAccessScope, type AccessScope } from "@/lib/auth/access";
import { getHomeDashboardData } from "@/lib/dashboard/home-data";
import { getSingleParam } from "@/lib/query-params";

type HomePageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export const revalidate = 120;

export default async function Home({ searchParams }: HomePageProps) {
  const accessScope = await getAuthenticatedAccessScope();

  if (!accessScope) {
    redirect("/auth/login?next=/");
  }

  const resolvedParams = await searchParams;
  const currentTab = normalizeTab(getSingleParam(resolvedParams.tab));
  const focusFilter = normalizeFocusFilter(getSingleParam(resolvedParams.focus));
  const hasExplicitTribeFilter = hasTribeFilterParam(resolvedParams);
  const selectedTribes = getSelectedTribes(resolvedParams, accessScope);
  const filteredScope: AccessScope = {
    ...accessScope,
    isPlatformAdmin: hasExplicitTribeFilter ? false : accessScope.isPlatformAdmin,
    tribes: hasExplicitTribeFilter ? selectedTribes : accessScope.tribes,
  };
  const data = await getHomeDashboardData(filteredScope);

  return (
    <HomeDashboard
      accessScope={accessScope}
      currentTab={currentTab}
      focusFilter={focusFilter}
      hasExplicitTribeFilter={hasExplicitTribeFilter}
      selectedTribes={selectedTribes}
      persistedTribeFilters={hasExplicitTribeFilter ? selectedTribes : undefined}
      data={data}
    />
  );
}
