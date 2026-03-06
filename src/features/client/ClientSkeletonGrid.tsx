import type React from "react";
import { SkeletonCard } from "@/components/ui/Skeleton";

export const ClientSkeletonGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <SkeletonCard key={`skeleton-card-${i.toString()}`} />
      ))}
    </div>
  );
};
