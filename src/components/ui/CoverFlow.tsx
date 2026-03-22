import { convertFileSrc } from "@tauri-apps/api/core";
import { type MotionValue, m, useScroll, useTransform } from "motion/react";
import type React from "react";
import { useRef } from "react";
import type { Book, Host } from "@/types/core";

interface CoverFlowProps {
  books: Book[];
  title: string;
  host?: Host | null;
  token?: string;
  onInfoClick?: (book: Book, coverUrl?: string) => void;
}

export const CoverFlow: React.FC<CoverFlowProps> = ({ books, title, host, token, onInfoClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: containerRef });

  if (!books || books.length === 0) return null;

  return (
    <div className="w-full py-8 mb-8 overflow-hidden relative">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-xl font-bold tracking-tight text-base-content">{title}</h3>
      </div>

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-8 px-[30vw] py-8 perspective-[1200px]"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {books.map((book, index) => {
          const isLocal =
            book.local_path ||
            (book.cover_url &&
              !book.cover_url.startsWith("http") &&
              !book.cover_url.startsWith("/api/"));

          let coverUrl: string | undefined;
          if (isLocal && book.cover_url) {
            coverUrl = convertFileSrc(book.cover_url);
          } else if (host && book.cover_url) {
            coverUrl = `http://${host.ip}:${host.port}/api/cover/${book.id}${token ? `?token=${token}` : ""}`;
          }

          return (
            <CoverFlowItem
              key={book.id}
              book={book}
              coverUrl={coverUrl}
              index={index}
              total={books.length}
              scrollXProgress={scrollXProgress}
              onInfoClick={onInfoClick}
              containerRef={containerRef}
            />
          );
        })}
      </div>

      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-16 md:w-32 bg-gradient-to-r from-base-100 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-16 md:w-32 bg-gradient-to-l from-base-100 to-transparent pointer-events-none z-10" />
    </div>
  );
};

interface CoverFlowItemProps {
  book: Book;
  coverUrl?: string;
  index: number;
  total: number;
  scrollXProgress: MotionValue<number>;
  onInfoClick?: (book: Book, coverUrl?: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const CoverFlowItem: React.FC<CoverFlowItemProps> = ({
  book,
  coverUrl,
  index,
  total,
  scrollXProgress,
  onInfoClick,
  containerRef,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Normalize index from 0 to 1 across the total track
  // This calculation is based on the item's position within the scroll container
  const itemIndex =
    containerRef.current && itemRef.current
      ? Array.from(containerRef.current.children).indexOf(itemRef.current) /
        (containerRef.current.children.length - 1 || 1)
      : index / total; // Fallback if refs are not ready

  // Transform based on scroll position to create the 3D effect
  const rotateY = useTransform(
    scrollXProgress,
    [itemIndex - 0.2, itemIndex, itemIndex + 0.2],
    [45, 0, -45],
    {
      clamp: false,
    },
  );
  const scale = useTransform(
    scrollXProgress,
    [itemIndex - 0.2, itemIndex, itemIndex + 0.2],
    [0.8, 1, 0.8],
    {
      clamp: false,
    },
  );
  const zIndex = useTransform(
    scrollXProgress,
    [itemIndex - 0.2, itemIndex, itemIndex + 0.2],
    [0, 10, 0],
    {
      clamp: false,
    },
  );
  const opacity = useTransform(
    scrollXProgress,
    [itemIndex - 0.3, itemIndex, itemIndex + 0.3],
    [0.3, 1, 0.3],
    {
      clamp: false,
    },
  );

  return (
    <m.div
      ref={itemRef}
      className="snap-center shrink-0 w-40 sm:w-48 lg:w-56 cursor-pointer transform-gpu"
      style={{
        rotateY,
        scale,
        zIndex,
        opacity,
        transformStyle: "preserve-3d",
      }}
      onClick={() => onInfoClick?.(book, coverUrl)}
    >
      <div className="w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl relative">
        {coverUrl ? (
          <>
            <m.img
              layoutId={`book-cover-${book.id}`}
              src={coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
            />
            {/* Glossy reflection overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
          </>
        ) : (
          <m.div
            layoutId={`book-cover-${book.id}`}
            className="w-full h-full flex items-center justify-center bg-base-300"
          >
            <span className="text-base-content/30 text-xs font-bold px-4 text-center">
              {book.title}
            </span>
          </m.div>
        )}
      </div>
      <m.p
        className="text-center mt-4 text-sm font-bold truncate px-2 text-base-content"
        style={{ opacity }}
      >
        {book.title}
      </m.p>
    </m.div>
  );
};
