import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading campaigns">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Card className="gap-4 px-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
      </Card>
      <div className="mt-6 grid gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
