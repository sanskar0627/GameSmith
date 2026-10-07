import { Skeleton } from "@/components/ui/skeleton";

/** Page-area skeleton inside the app shell (the sidebar stays put). */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-1 flex-col">
      <div className="flex h-12 items-center gap-3 border-b border-hairline px-4">
        <Skeleton className="size-6" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-3.5 w-28" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
              <Skeleton className="aspect-[16/10] rounded-none" />
              <div className="flex flex-col gap-2 p-3.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-1.5 h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
