import { Star } from "lucide-react";
import type React from "react";

interface StarRatingProps {
  rating: number;
}

/** Render star rating (Calibre stores 0-10, we display 0-5). */
export const StarRating: React.FC<StarRatingProps> = ({ rating }) => {
  const stars = Math.round(rating / 2);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={`star-${i.toString()}`}
          className={`w-3.5 h-3.5 ${i < stars ? "text-warning fill-warning" : "text-base-content/20"}`}
        />
      ))}
    </div>
  );
};
