import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility to merge tailwind classes */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-base-300", className)} {...props} />;
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col space-y-2 p-2 sm:p-3 border border-base-300 rounded-lg">
      <Skeleton className="aspect-[2/3] w-full rounded-md" />
      <div className="space-y-1.5 px-1">
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
