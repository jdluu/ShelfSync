import React from 'react';
import { Input, HStack, Box } from "@chakra-ui/react";
import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  value, 
  onChange, 
  placeholder = "Search books..." 
}) => {
  return (
    <HStack w="full" maxW="md" gap={2} position="relative">
      <Box position="absolute" left={3} zIndex={1} color="fg.muted" pointerEvents="none">
        <Search size={18} />
      </Box>
      <Input 
        pl={10} 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        placeholder={placeholder}
        variant="subtle"
        bg="bg.subtle"
        borderColor="border"
        _focus={{ borderColor: "accent", bg: "bg.canvas" }}
      />
    </HStack>
  );
};
