import { Link } from "@chakra-ui/react";

export const SkipLink = () => {
  return (
    <Link
      href="#main-content"
      className="skip-link"
      position="absolute"
      top="-40px"
      left={0}
      px="s"
      py="xs"
      bg="bg.inverted"
      color="fg.inverted"
      zIndex={100}
      _focus={{ top: 0 }}
    >
      Skip to main content
    </Link>
  );
};
