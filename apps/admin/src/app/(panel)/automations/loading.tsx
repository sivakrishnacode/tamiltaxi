import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RemindersLoading() {
  return (
    <div aria-busy="true" aria-label="Loading reminders">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i} className="gap-4 px-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-10 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
