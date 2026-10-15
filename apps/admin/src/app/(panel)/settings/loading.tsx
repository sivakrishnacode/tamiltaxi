import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading settings">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <div className="grid content-start gap-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="hidden h-7 w-full lg:block" />
          ))}
        </div>
        <Card className="gap-4 px-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
