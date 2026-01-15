import { Link } from "@chakra-ui/react";

export const SkipLink = () => {
  return (
    <Link
      href="#main-content"
      position="absolute"
      top="-100px"
      left="4"
      px="4"
      py="2"
      bg="bg.inverted"
      color="fg.inverted"
      zIndex={9999}
      borderRadius="md"
      fontWeight="medium"
      textDecoration="none"
      transition="top 0.15s ease-out"
      _focus={{ 
        top: "4",
        outline: "2px solid",
        outlineColor: "accent",
        outlineOffset: "2px"
      }}
    >
      Skip to main content
    </Link>
  );
};
