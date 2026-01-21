import React, { useEffect } from 'react';
import {
  Box, Container, HStack, Heading, Text, Button, Icon,
  SimpleGrid, Spinner, Badge, VStack, Alert
} from "@chakra-ui/react";
import { Book as BookIcon, Search, WifiOff } from "lucide-react";
import { ColorModeButton } from "@/components/ui/color-mode";
import { Footer } from "@/components/Footer";
import { SkipLink } from "@/components/SkipLink";
import { Discovery } from "@/features/discovery/Discovery";
import { Book } from "@/types";
import { BookCard } from "@/components/BookCard";
import { SearchBar } from "@/components/SearchBar";
import { SortMenu, SortOption } from "@/components/SortMenu";
import { Toaster } from "@/components/ui/toaster";
import { useLibrary } from "@/context/LibraryContext";
import { QueueOverlay } from "@/components/QueueOverlay";
import { EmptyState } from "@/components/EmptyState";

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
  onSync: (book: Book) => Promise<void>;
  onOpenBook: (path: string) => void;
  onToggleStatus: (book: Book) => Promise<void>;
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
  onToggleStatus,
  onChangeRole,
}) => {
  const { syncProgress, syncBooks } = useLibrary();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortOption, setSortOption] = React.useState<SortOption>("title");
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());

  const filterAndSort = (list: Book[]) => {
      let result = [...list];

      // Filter
      if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          result = result.filter(b =>
              b.title.toLowerCase().includes(lower) ||
              b.authors.toLowerCase().includes(lower) ||
              (b.series && b.series.toLowerCase().includes(lower)) ||
              (b.tags && b.tags.some(t => t.toLowerCase().includes(lower)))
          );
      }

      // Sort
      result.sort((a, b) => {
          if (sortOption === "title") return a.title.localeCompare(b.title);
          if (sortOption === "author") return a.authors.localeCompare(b.authors);
          if (sortOption === "recent") return (b.id || 0) - (a.id || 0);
          if (sortOption === "series") {
              const sA = a.series || "";
              const sB = b.series || "";
              if (sA !== sB) return sA.localeCompare(sB);
              return (a.series_index || 0) - (b.series_index || 0);
          }
          return 0;
      });

      return result;
  };

  const filteredRemoteBooks = filterAndSort(books);
  const filteredLocalBooks = filterAndSort(localBooks);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            setSelectionMode(false);
            setSelectedIds(new Set());
        }
        if (selectionMode && (e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const allFilteredIds = new Set(filteredRemoteBooks.map(b => b.id));
            setSelectedIds(allFilteredIds);
        }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [selectionMode, filteredRemoteBooks]);

  const handleSync = async (book: Book) => {
    await onSync(book);
  };

  const toggleSelection = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const startBulkSync = async () => {
    const toSync = books.filter(b => selectedIds.has(b.id));
    await syncBooks(toSync);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <>
    <SkipLink />
    <Toaster />
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
                  <Button 
                    onClick={() => {
                        setSelectionMode(!selectionMode);
                        setSelectedIds(new Set());
                    }} 
                    variant={selectionMode ? "solid" : "outline"} 
                    size="sm"
                    colorPalette={selectionMode ? "blue" : "gray"}
                   >
                       {selectionMode ? "Cancel Selection" : "Select Multiple"}
                   </Button>
               )}
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
              <HStack justify="space-between" wrap="wrap" gap={4}>
                  <HStack>
                    <Heading size="lg">Available Books (Remote)</Heading>
                    <Badge colorPalette="green" variant="solid">Live Sync</Badge>
                  </HStack>
                  <HStack>
                      <SearchBar value={searchTerm} onChange={setSearchTerm} />
                      <SortMenu value={sortOption} onChange={setSortOption} />
                  </HStack>
              </HStack>

                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                    {filteredRemoteBooks.map((book) => (
                    <BookCard 
                        key={book.id} 
                        book={book} 
                        host={connectedHost}
                        variant="remote"
                        onAction={handleSync}
                        selected={selectedIds.has(book.id)}
                        selectable={selectionMode}
                        onSelect={() => toggleSelection(book.id)}
                        syncStatus={syncProgress[book.id]}
                        actionLabel="Sync to Replica"
                        actionColor="blue"
                    />
                  ))}
              </SimpleGrid>

              {connectedHost && filteredRemoteBooks.length === 0 && !loading && (
                  <VStack py={12}>
                      <EmptyState 
                          icon={Search}
                          title="No Books Found"
                          description={searchTerm ? `No results for "${searchTerm}" in this library.` : "This library appears to be empty."}
                          actionLabel={searchTerm ? "Clear Search" : undefined}
                          onAction={() => setSearchTerm("")}
                      />
                  </VStack>
              )}
           </VStack>
        ) : (
           <VStack align="stretch" gap={12}>
              <Discovery onConnect={onConnect} />
              
              {localBooks.length > 0 && (
                  <Box pt={8} borderTopWidth="1px" borderColor="border.subtle">
                       <Heading size="lg" mb={6}>Local Library (Offline)</Heading>
                       <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                          {filteredLocalBooks.map((book) => (
                              <BookCard 
                                key={book.id} 
                                book={book}
                                variant="local"
                                onAction={() => onOpenBook(book.local_path!)}
                                onToggleStatus={onToggleStatus}
                                actionLabel="Read"
                                actionColor="green"
                            />
                          ))}
                       </SimpleGrid>
                  </Box>
              )}

              <VStack py={12}>
                  <EmptyState 
                      icon={WifiOff}
                      title="Not Connected"
                      description="Connect to a host to browse and sync books."
                  />
              </VStack>
           </VStack>
        )}
      </Container>
    </Box>
    {selectionMode && selectedIds.size > 0 && (
        <Box 
            position="fixed" 
            bottom={6} 
            left="50%" 
            transform="translateX(-50%)" 
            zIndex={2500}
            bg="bg.panel"
            p={4}
            borderRadius="xl"
            boxShadow="2xl"
            borderWidth="1px"
            borderColor="blue.500"
            minW="400px"
        >
            <HStack justify="space-between">
                <HStack gap={4}>
                    <Text fontWeight="bold">{selectedIds.size} books selected</Text>
                    <HStack gap={2}>
                        <Button variant="ghost" size="xs" onClick={() => setSelectedIds(new Set(filteredRemoteBooks.map(b => b.id)))}>
                            Select All {searchTerm ? "(Filtered)" : ""}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => setSelectedIds(new Set())}>
                            Select None
                        </Button>
                    </HStack>
                </HStack>
                <HStack gap={3}>
                    <Button colorPalette="blue" size="sm" onClick={startBulkSync}>Sync Selected to Device</Button>
                </HStack>
            </HStack>
        </Box>
    )}
    <QueueOverlay progress={syncProgress} />
    <Footer />
    </>
  );
};
