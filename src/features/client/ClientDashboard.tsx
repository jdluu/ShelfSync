import React from 'react';
import { 
  Box, Container, HStack, Heading, Text, Button, Card, Icon, 
  SimpleGrid, Spinner, Badge, VStack, Alert 
} from "@chakra-ui/react";
import { Book as BookIcon } from "lucide-react";
import { ColorModeButton } from "../../components/ui/color-mode";
import { Footer } from "../../components/Footer";
import { SkipLink } from "../../components/SkipLink";
import { Discovery } from "../discovery/Discovery";
import { Book } from "../../types";

interface Host {
  ip: string;
  port: number;
  hostname: string;
}

interface ClientDashboardProps {
  books: Book[];
  localBooks: Book[];
  loading: boolean;
  error: string | null;
  connectedHost: Host | null;
  onConnect: (host: Host) => void;
  onDisconnect: () => void;
  onSync: (book: Book) => void;
  onOpenBook: (path: string) => void;
  onChangeRole: () => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  books,
  localBooks,
  loading,
  error,
  connectedHost,
  onConnect,
  onDisconnect,
  onSync,
  onOpenBook,
  onChangeRole,
}) => {
  return (
    <>
    <SkipLink />
    <Box as="main" id="main-content" minH="100vh" bg="bg.canvas" color="fg" p={6} pb={16}>
      <Container maxW="container.xl">
        <HStack justify="space-between" mb={8}>
           <Box>
              <Heading size="2xl" display="flex" alignItems="center" gap={2}>
                  <Icon color="success" asChild><BookIcon /></Icon>
                  ShelfSync Client
              </Heading>
              {connectedHost && (
                  <Text color="fg.muted">Connected to {connectedHost.hostname} ({connectedHost.ip})</Text>
              )}
           </Box>
           <HStack>
              <ColorModeButton />
              {connectedHost && (
                  <Button onClick={onDisconnect} variant="subtle" size="sm">
                      Disconnect
                  </Button>
              )}
              <Button onClick={onChangeRole} variant="ghost" size="sm" color="fg.muted">
                  Change Role
              </Button>
           </HStack>
        </HStack>

        {error && (
          <Alert.Root status="error" mb={6}>
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        {loading ? (
           <Box textAlign="center" py={20}>
              <Spinner size="xl" color="success" />
              <Text mt={4} color="fg.muted">Communicating with host...</Text>
           </Box>
        ) : connectedHost ? (
           <VStack align="stretch" gap={6}>
              <HStack justify="space-between">
                  <Heading size="lg">Available Books (Remote)</Heading>
                  <Badge colorPalette="green" variant="solid">Live Sync</Badge>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                  {books.map((book) => (
                  <Card.Root key={book.id} bg="bg.subtle" borderColor="border">
                      <Card.Body p={4}>
                         <HStack align="start" gap={4}>
                             <Box w={20} h={28} bg="bg.muted" borderRadius="md" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
                                <Icon color="fg.subtle" w={8} h={8} asChild><BookIcon /></Icon>
                             </Box>
                             <VStack align="start" gap={1} flex={1} overflow="hidden">
                                <Heading size="sm" truncate w="full">{book.title}</Heading>
                                <Text fontSize="sm" color="fg.muted" truncate w="full">{book.authors}</Text>
                                <Button 
                                  size="xs" 
                                  colorPalette="blue" 
                                  onClick={() => onSync(book)}
                                >
                                  Sync to Replica
                                </Button>
                             </VStack>
                         </HStack>
                      </Card.Body>
                  </Card.Root>
                  ))}
              </SimpleGrid>
           </VStack>
        ) : (
           <VStack align="stretch" gap={12}>
              <Discovery onConnect={onConnect} />
              
              {localBooks.length > 0 && (
                  <Box pt={8} borderTopWidth="1px" borderColor="border.subtle">
                       <Heading size="lg" mb={6}>Local Library (Offline)</Heading>
                       <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                          {localBooks.map((book) => (
                          <Card.Root key={book.id} bg="bg.subtle" borderColor="border" opacity={0.8}>
                              <Card.Body p={4}>
                                 <HStack align="start" gap={4}>
                                     <Box w={20} h={28} bg="bg.muted" borderRadius="md" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
                                        <Icon color="fg.subtle" w={8} h={8} asChild><BookIcon /></Icon>
                                     </Box>
                                     <VStack align="start" gap={1} flex={1} overflow="hidden">
                                        <Heading size="sm" truncate w="full" color="fg.muted">{book.title}</Heading>
                                        <Text fontSize="sm" color="fg.subtle" truncate w="full">{book.authors}</Text>
                                        <HStack mt={1}>
                                            <Badge variant="surface" colorPalette="gray">Downloaded</Badge>
                                            <Button 
                                              size="xs" 
                                              colorPalette="green"
                                              onClick={() => onOpenBook(book.local_path!)}
                                            >
                                              Read
                                            </Button>
                                        </HStack>
                                     </VStack>
                                 </HStack>
                              </Card.Body>
                          </Card.Root>
                          ))}
                       </SimpleGrid>
                  </Box>
              )}
           </VStack>
        )}
      </Container>
    </Box>
    <Footer />
    </>
  );
};
