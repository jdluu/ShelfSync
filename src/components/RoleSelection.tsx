import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Box, VStack, Heading, Text, Container, SimpleGrid, Card, Icon, HStack } from "@chakra-ui/react";
import { ColorModeButton } from "./ui/color-mode";

interface RoleSelectionProps {
  onSelect: (role: 'host' | 'client') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  return (
    <Box minH="100vh" bg="bg.canvas" color="fg" display="flex" alignItems="center" justifyContent="center" p={6}>
      <Container maxW="md">
        <VStack gap={8} textAlign="center">
          <HStack justify="flex-end" w="full" position="absolute" top={4} right={4}>
            <ColorModeButton />
          </HStack>
          
          <Box>
            <Heading size="4xl" mb={2}>ShelfSync</Heading>
            <Text color="fg.muted">Choose your device role</Text>
          </Box>

          <SimpleGrid columns={1} gap={4} w="full">
            <Card.Root 
              onClick={() => onSelect('host')}
              cursor="pointer"
              bg="bg.subtle"
              borderColor="border"
              borderWidth="1px"
              transition="all 0.2s"
              _hover={{ bg: "bg.muted", borderColor: "accent" }}
            >
              <Card.Body>
                <VStack gap={4}>
                  <Box w={16} h={16} borderRadius="full" bg="bg.muted" display="flex" alignItems="center" justifyContent="center">
                    <Icon color="accent" w={8} h={8} asChild><Monitor /></Icon>
                  </Box>
                  <Box textAlign="center">
                    <Heading size="md">Host (Desktop)</Heading>
                    <Text fontSize="sm" color="fg.muted">Share your Calibre library with other devices.</Text>
                  </Box>
                </VStack>
              </Card.Body>
            </Card.Root>

            <Card.Root 
              onClick={() => onSelect('client')}
              cursor="pointer"
              bg="bg.subtle"
              borderColor="border"
              borderWidth="1px"
              transition="all 0.2s"
              _hover={{ bg: "bg.muted", borderColor: "success" }}
            >
              <Card.Body>
                <VStack gap={4}>
                  <Box w={16} h={16} borderRadius="full" bg="bg.muted" display="flex" alignItems="center" justifyContent="center">
                    <Icon color="success" w={8} h={8} asChild><Smartphone /></Icon>
                  </Box>
                  <Box textAlign="center">
                    <Heading size="md">Client (Mobile)</Heading>
                    <Text fontSize="sm" color="fg.muted">Sync and download books from a ShelfSync host.</Text>
                  </Box>
                </VStack>
              </Card.Body>
            </Card.Root>
          </SimpleGrid>
        </VStack>
      </Container>
    </Box>
  );
};
