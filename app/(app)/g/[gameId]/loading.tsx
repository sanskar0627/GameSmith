import { Skeleton } from "@/components/ui/skeleton";

/** Workspace skeleton: thread on the left, dark stage on the right. */
export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" aria-label="Loading game" className="flex h-dvh flex-col">
      <div className="flex h-12 items-center gap-3 border-b border-hairline px-4">
        <Skeleton className="size-6" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-full flex-col gap-6 p-6 md:w-[42%]">
          <Skeleton className="ml-auto h-10 w-2/3 rounded-xl" />
          <div className="flex gap-3">
            <Skeleton className="size-6" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="mt-2 h-24 w-full rounded-xl" />
            </div>
          </div>
        </div>
        <div className="dark hidden flex-1 border-l border-hairline bg-background p-3 md:block">
          <div className="size-full rounded-xl bg-night ring-1 ring-border" />
        </div>
      </div>
    </div>
  );
}
