import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility to merge tailwind classes */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-base-300", className)} {...props} />;
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col space-y-3 p-4 border border-base-300 rounded-xl">
      <Skeleton className="h-[125px] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  );
}
