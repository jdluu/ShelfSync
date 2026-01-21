import React from 'react';
import { Menu, Button, Icon } from "@chakra-ui/react";
import { ArrowUpDown, Check } from "lucide-react";

export type SortOption = "title" | "author" | "recent" | "series";

interface SortMenuProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

export const SortMenu: React.FC<SortMenuProps> = ({ value, onChange }) => {
  const labelMap: Record<SortOption, string> = {
    title: "Title",
    author: "Author",
    recent: "Recently Added",
    series: "Series",
  };

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="outline" size="sm">
          <Icon mr={1} asChild><ArrowUpDown /></Icon>
          Sort by: {labelMap[value]}
        </Button>
      </Menu.Trigger>
      <Menu.Content>
        {Object.entries(labelMap).map(([key, label]) => (
          <Menu.Item 
            key={key} 
            value={key} 
            onClick={() => onChange(key as SortOption)}
            justifyContent="space-between"
          >
            {label}
            {value === key && <Icon size="sm" color="success" asChild><Check /></Icon>}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
};
