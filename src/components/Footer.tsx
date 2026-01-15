import { Box, HStack, Text, Link, Icon } from "@chakra-ui/react";
import { Github } from "lucide-react";

export const Footer = () => {
  return (
    <Box
      as="footer"
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      py={3}
      px={6}
      bg="bg.subtle"
      borderTopWidth="1px"
      borderColor="border.subtle"
    >
      <HStack justify="center" gap={4}>
        <Text fontSize="xs" color="fg.subtle">
          ShelfSync © {new Date().getFullYear()}
        </Text>
        <Link
          href="https://github.com/jdluu/ShelfSync"
          target="_blank"
          rel="noopener noreferrer"
          fontSize="xs"
          color="fg.muted"
          display="flex"
          alignItems="center"
          gap={1}
          _hover={{ color: "accent" }}
        >
          <Icon w={3.5} h={3.5} asChild><Github /></Icon>
          Source
        </Link>
      </HStack>
    </Box>
  );
};
