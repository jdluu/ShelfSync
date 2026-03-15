import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowSize } from "@/hooks/useWindowSize";

interface VirtualGridProps<T> {
  items: T[];
  itemComponent: React.ComponentType<{ item: T; index: number }>;
  viewMode: "grid" | "list";
  keyExtractor: (item: T) => React.Key;
  gridRowHeight?: number;
  listRowHeight?: number;
  gap?: number;
}

interface VirtualGridItemProps<T> {
  item: T;
  index: number;
  ItemComponent: React.ComponentType<{ item: T; index: number }>;
  keyExtractor: (item: T) => React.Key;
}

const VirtualGridItem = <T,>({
  item,
  index,
  ItemComponent,
  keyExtractor,
}: VirtualGridItemProps<T>) => (
  <div key={keyExtractor(item)} style={{ width: "100%" }}>
    <ItemComponent item={item} index={index} />
  </div>
);

export function VirtualGrid<T>({
  items,
  itemComponent: ItemComponent,
  viewMode,
  keyExtractor,
  gridRowHeight = 260, // approximate height of a grid book card
  listRowHeight = 140, // approximate height of a list book card
  gap = 16, // tailwind gap-4
}: VirtualGridProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { width } = useWindowSize();
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    if (scrollRef.current) {
      // Calculate how far this grid is from the top of the scrolling element (window)
      // This is crucial for stacked virtualizers.
      setOffsetTop(scrollRef.current.offsetTop);
    }
  }, []);

  // Determine columns based on tailwind breakpoints
  // Grid: Base=2, sm(640)=3, md(768)=4, lg(1024)=6, xl(1280)=8
  // List: Base=1, md(768)=2
  const columnCount = useMemo(() => {
    if (viewMode === "grid") {
      if (width >= 1280) return 8;
      if (width >= 1024) return 6;
      if (width >= 768) return 4;
      if (width >= 640) return 3;
      return 2;
    } else {
      if (width >= 768) return 2;
      return 1;
    }
  }, [width, viewMode]);

  const rowCount = Math.ceil(items.length / columnCount);
  const rowHeight = viewMode === "grid" ? gridRowHeight : listRowHeight;

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight + gap,
    overscan: 3,
    scrollMargin: offsetTop, // Offset the virtualizer calculations by how far down this container is rendered
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      ref={scrollRef}
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: "100%",
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const startIndex = virtualRow.index * columnCount;
        const rowItems = items.slice(startIndex, startIndex + columnCount);

        return (
          <div
            key={virtualRow.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${rowHeight}px`,
              transform: `translateY(${virtualRow.start - offsetTop}px)`,
              display: "grid",
              // Use standard CSS Grid to define the columns dynamically
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
              gap: `${gap}px`,
            }}
          >
            {rowItems.map((item, colIndex) => (
              <VirtualGridItem
                key={keyExtractor(item)}
                item={item}
                index={startIndex + colIndex}
                ItemComponent={ItemComponent}
                keyExtractor={keyExtractor}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
