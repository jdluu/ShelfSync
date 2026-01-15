import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Box, VStack, Heading, Text, Container, SimpleGrid, Card, Icon } from "@chakra-ui/react";
import { nord } from "../theme";

interface RoleSelectionProps {
  onSelect: (role: 'host' | 'client') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  return (
    <Box minH="100vh" bg={nord.nord0} color={nord.nord6} display="flex" alignItems="center" justifyContent="center" p={6}>
      <Container maxW="md">
        <VStack gap={8} textAlign="center">
          <Box>
            <Heading size="4xl" mb={2}>ShelfSync</Heading>
            <Text color={nord.nord4}>Choose your device role</Text>
          </Box>

          <SimpleGrid columns={1} gap={4} w="full">
            <Card.Root 
              onClick={() => onSelect('host')}
              cursor="pointer"
              bg={nord.nord1}
              borderColor={nord.nord2}
              borderWidth="1px"
              transition="all 0.2s"
              _hover={{ bg: nord.nord2, borderColor: nord.nord8 }}
            >
              <Card.Body>
                <VStack gap={4}>
                  <Box w={16} h={16} borderRadius="full" bg={nord.nord2} display="flex" alignItems="center" justifyContent="center">
                    <Icon color={nord.nord8} w={8} h={8} asChild><Monitor /></Icon>
                  </Box>
                  <Box textAlign="center">
                    <Heading size="md">Host (Desktop)</Heading>
                    <Text fontSize="sm" color={nord.nord4}>Share your Calibre library with other devices.</Text>
                  </Box>
                </VStack>
              </Card.Body>
            </Card.Root>

            <Card.Root 
              onClick={() => onSelect('client')}
              cursor="pointer"
              bg={nord.nord1}
              borderColor={nord.nord2}
              borderWidth="1px"
              transition="all 0.2s"
              _hover={{ bg: nord.nord2, borderColor: nord.nord14 }}
            >
              <Card.Body>
                <VStack gap={4}>
                  <Box w={16} h={16} borderRadius="full" bg={nord.nord2} display="flex" alignItems="center" justifyContent="center">
                    <Icon color={nord.nord14} w={8} h={8} asChild><Smartphone /></Icon>
                  </Box>
                  <Box textAlign="center">
                    <Heading size="md">Client (Mobile)</Heading>
                    <Text fontSize="sm" color={nord.nord4}>Sync and download books from a ShelfSync host.</Text>
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
