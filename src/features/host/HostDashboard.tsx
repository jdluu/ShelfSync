import React from 'react';
import { 
  Box, Container, HStack, Heading, Text, Button, Card, Icon, 
  SimpleGrid, Spinner, VStack, Grid, GridItem, Alert 
} from "@chakra-ui/react";
import { FolderOpen, Book as BookIcon, Network, Wifi } from "lucide-react";
import QRCode from "react-qr-code";
import { ColorModeButton } from "@/components/ui/color-mode";
import { Footer } from "@/components/Footer";
import { SkipLink } from "@/components/SkipLink";
import { Book, ConnectionInfo } from "@/types";

interface HostDashboardProps {
  books: Book[];
  loading: boolean;
  error: string | null;
  libraryPath: string;
  connectionInfo: ConnectionInfo | null;
  onSelectFolder: () => void;
  onChangeRole: () => void;
}

export const HostDashboard: React.FC<HostDashboardProps> = ({
  books,
  loading,
  error,
  libraryPath,
  connectionInfo,
  onSelectFolder,
  onChangeRole,
}) => {
  return (
    <>
    <SkipLink />
    <Box as="main" id="main-content" minH="100vh" bg="bg.canvas" color="fg" p={6} pb={16}>
      <Container maxW="container.xl">
        <Grid templateColumns={{ base: "1fr", md: "1fr 320px" }} gap={6}>
           <GridItem>
              <HStack justify="space-between" mb={8} align="start">
                 <Box>
                    <Heading size="2xl" display="flex" alignItems="center" gap={2}>
                        <Icon color="accent" asChild><BookIcon /></Icon>
                        ShelfSync Host
                    </Heading>
                    <Text color="fg.muted">Local Replica Sync Engine</Text>
                    <Button onClick={onChangeRole} variant="ghost" size="xs" color="fg.subtle" mt={2}>
                        Change Role
                    </Button>
                 </Box>

                 <HStack gap={2}>
                    <ColorModeButton />
                    <VStack align="end" gap={2}>
                      <Button onClick={onSelectFolder} colorPalette="blue">
                          <Icon mr={2} asChild><FolderOpen /></Icon>
                          {libraryPath ? "Change Library" : "Select Library"}
                      </Button>
                      <Text fontSize="xs" fontFamily="mono" color="fg.subtle" maxW="300px" truncate>
                          {libraryPath || "No library selected"}
                      </Text>
                    </VStack>
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
                    <Spinner size="lg" />
                    <Text mt={2}>Loading library...</Text>
                 </Box>
              ) : books.length > 0 ? (
                 <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                    {books.map((book) => (
                    <Card.Root key={book.id} bg="bg.subtle" borderColor="border" _hover={{ shadow: "md" }} transition="box-shadow 0.2s">
                        <Card.Body p={4}>
                             <Heading size="sm" truncate>{book.title}</Heading>
                             <Text fontSize="sm" color="fg.muted" truncate mb={2}>{book.authors}</Text>
                             <Text fontSize="xs" color="fg.subtle" fontFamily="mono" wordBreak="break-all">{book.path}</Text>
                        </Card.Body>
                    </Card.Root>
                    ))}
                 </SimpleGrid>
              ) : (
                 <Box textAlign="center" py={20} bg="bg.subtle" borderRadius="xl" borderWidth="1px" borderStyle="dashed" borderColor="border">
                    {libraryPath ? (
                        <Text color="fg.muted">No books found in this library.</Text>
                    ) : (
                        <VStack>
                            <Text color="fg" fontWeight="medium">Welcome to ShelfSync Host</Text>
                            <Text color="fg.subtle" fontSize="sm">Select your Calibre library folder to begin.</Text>
                        </VStack>
                    )}
                 </Box>
              )}
           </GridItem>

           <GridItem>
              <Box bg="bg.subtle" p={6} borderRadius="xl" borderWidth="1px" borderColor="border">
                 <Heading size="md" mb={4} display="flex" alignItems="center" gap={2}>
                    <Icon color="success" asChild><Network /></Icon>
                    Connectivity
                 </Heading>
                 
                 {connectionInfo ? (
                    <VStack align="stretch" gap={6}>
                       <Box bg="white" p={4} borderRadius="lg" display="flex" justifyContent="center">
                          <QRCode 
                            value={JSON.stringify(connectionInfo)}
                            size={200}
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            viewBox={`0 0 256 256`}
                          />
                       </Box>

                       <VStack gap={3}>
                           <HStack p={3} bg="bg.muted" borderRadius="lg" borderWidth="1px" borderColor="border">
                              <Icon color="fg.subtle" asChild><Wifi /></Icon>
                              <Box>
                                 <Text fontSize="xs" color="fg.subtle" textTransform="uppercase">Host IP</Text>
                                 <Text fontFamily="mono" fontSize="lg">{connectionInfo.ip}</Text>
                              </Box>
                           </HStack>

                           <HStack p={3} bg="bg.muted" borderRadius="lg" borderWidth="1px" borderColor="border">
                              <Box w={5} display="flex" justifyContent="center" color="fg.subtle" fontFamily="mono">:</Box>
                              <Box>
                                 <Text fontSize="xs" color="fg.subtle" textTransform="uppercase">Port</Text>
                                 <Text fontFamily="mono" fontSize="lg">{connectionInfo.port}</Text>
                              </Box>
                           </HStack>

                           <HStack p={3} bg="bg.muted" borderRadius="lg" borderWidth="1px" borderColor="border">
                              <Box w={5} display="flex" justifyContent="center" color="fg.subtle" fontFamily="mono">@</Box>
                              <Box>
                                 <Text fontSize="xs" color="fg.subtle" textTransform="uppercase">Hostname</Text>
                                 <Text fontFamily="mono" fontSize="lg" truncate maxW="200px">{connectionInfo.hostname}</Text>
                              </Box>
                           </HStack>
                       </VStack>
                       
                       <Text fontSize="xs" color="fg.subtle" textAlign="center">
                          Scan this QR code with the ShelfSync mobile app to connect.
                       </Text>
                    </VStack>
                 ) : (
                    <Text textAlign="center" py={10} color="fg.muted">Loading network info...</Text>
                 )}
              </Box>
           </GridItem>
        </Grid>
      </Container>
    </Box>
    <Footer />
    </>
  );
};
