import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PromosLoading() {
  return (
    <div aria-busy="true" aria-label="Loading splash and banners">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="flex-row items-center gap-4 px-4">
            <Skeleton className="h-24 w-48 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
