import { ArrowUpDown, Check } from "lucide-react";
import type React from "react";
import { useState } from "react";

export type SortOption = "title" | "author" | "recent" | "series";

interface SortMenuProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

export const SortMenu: React.FC<SortMenuProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Close when clicking outside
  // Implementing a simple outside click handler inside the component or using blur
  // DaisyUI dropdowns relying on focus work well but closing on item click needs blur.

  const closeDropdown = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsOpen(false);
  };

  const labelMap: Record<SortOption, string> = {
    title: "Title",
    author: "Author",
    recent: "Recently Added",
    series: "Series",
  };

  return (
    <div className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-sm btn-outline m-1"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <ArrowUpDown className="w-4 h-4 mr-1" aria-hidden="true" />
        Sort by: {labelMap[value]}
      </button>
      <ul className="dropdown-content z-[20] menu p-2 shadow bg-base-100 rounded-box w-52 border border-base-300">
        {Object.entries(labelMap).map(([key, label]) => (
          <li key={key}>
            <button
              type="button"
              className={value === key ? "active" : ""}
              onClick={() => {
                onChange(key as SortOption);
                closeDropdown();
              }}
            >
              {label}
              {value === key && <Check className="w-4 h-4 ml-auto" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
