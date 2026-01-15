import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import QRCode from "react-qr-code";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir, join } from "@tauri-apps/api/path";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Book } from "./types";
import { FolderOpen, Book as BookIcon, Network, Wifi } from "lucide-react";

import { 
  Box, Container, VStack, HStack, Heading, Text, Button, Card, Icon, 
  SimpleGrid, Spinner, Badge, Grid, GridItem, Alert 
} from "@chakra-ui/react";

import { RoleSelection } from "./components/RoleSelection";
import { Discovery } from "./components/Discovery";
import { initDB, getLocalBooks, saveBook } from "./db";
import { ColorModeButton } from "./components/ui/color-mode";

const STORE_PATH = "shelfsync_settings.json";

interface Host {
  ip: string;
  port: number;
  hostname: string;
}

interface ConnectionInfo {
  ip: string;
  port: number;
  hostname: string;
}

type AppMode = "unselected" | "host" | "client";

function App() {
  const [appMode, setAppMode] = useState<AppMode>("unselected");
  const [libraryPath, setLibraryPath] = useState<string>("");
  const [books, setBooks] = useState<Book[]>([]);
  const [localBooks, setLocalBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [connectedHost, setConnectedHost] = useState<Host | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const store = await load(STORE_PATH);
        
        const savedMode = await store.get<AppMode>("app_mode");
        if (savedMode) {
          setAppMode(savedMode);
        }

        const savedPath = await store.get<string>("library_path");
        if (savedPath) {
          setLibraryPath(savedPath);
          fetchBooks(savedPath);
        }

        const info = await invoke<ConnectionInfo>("get_connection_info");
        setConnectionInfo(info);
      } catch (e) {
        console.error("Failed to load data:", e);
      }
    }
    loadData();
  }, []);

  const handleSelectMode = async (mode: AppMode) => {
    setAppMode(mode);
    const store = await load(STORE_PATH);
    await store.set("app_mode", mode);
    await store.save();
    if (mode === "client") {
        setConnectedHost(null);
        setBooks([]);
        try {
            await initDB();
            const stored = await getLocalBooks();
            setLocalBooks(stored);
        } catch (e) {
            console.error("Failed to init local DB:", e);
        }
    }
  };

  const handleConnect = async (host: Host) => {
    setConnectedHost(host);
    setLoading(true);
    setError(null);
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000); 

        const response = await fetch(`http://${host.ip}:${host.port}/api/manifest`, {
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (!response.ok) throw new Error("Failed to fetch manifest");
        const data = await response.json();
        setBooks(data);
    } catch (e) {
        console.error("Connection error:", e);
        setError("Could not connect to host. Make sure it's running and accessible.");
    } finally {
        setLoading(false);
    }
  };

  const handleSync = async (book: Book) => {
      if (!connectedHost) return;
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 30000); 

        const response = await fetch(`http://${connectedHost.ip}:${connectedHost.port}/api/download/${book.id}/epub`, {
             signal: controller.signal
        });
        clearTimeout(id);

        if (!response.ok) throw new Error("Download failed");
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const fileName = `${book.title.replace(/[^a-z0-9]/gi, '_')}.epub`;
        const filePath = await join(await appDataDir(), fileName);
        
        await writeFile(filePath, uint8Array);
        await saveBook(book, filePath);
        
        const stored = await getLocalBooks();
        setLocalBooks(stored);

        console.log(`Synced "${book.title}" successfully!`);
      } catch (e) {
          console.error("Sync failed:", e);
          setError("Failed to sync book. Check console.");
      }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Calibre Library Folder",
      });

      if (selected && typeof selected === "string") {
        setLibraryPath(selected);
        const store = await load(STORE_PATH);
        await store.set("library_path", selected);
        await store.save();
        fetchBooks(selected);
      }
    } catch (e) {
      setError("Failed to open dialog: " + e);
    }
  };

  const fetchBooks = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Book[]>("get_books", { libraryPath: path });
      setBooks(result);
    } catch (e) {
      console.error("Error fetching books:", e);
      setError(typeof e === 'string' ? e : "Failed to load library database.");
    } finally {
      setLoading(false);
    }
  };

  if (appMode === "unselected") {
    return <RoleSelection onSelect={handleSelectMode} />;
  }

  if (appMode === "client") {
    return (
      <Box minH="100vh" bg="bg.canvas" color="fg" p={6}>
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
                    <Button onClick={() => setConnectedHost(null)} variant="subtle" size="sm">
                        Disconnect
                    </Button>
                )}
                <Button onClick={() => handleSelectMode("unselected")} variant="ghost" size="sm" color="fg.muted">
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
                                    onClick={() => handleSync(book)}
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
                <Discovery onConnect={handleConnect} />
                
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
                                                onClick={() => openPath(book.local_path!)}
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
    );
  }

  // Host Mode
  return (
    <Box minH="100vh" bg="bg.canvas" color="fg" p={6}>
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
                    <Button onClick={() => handleSelectMode("unselected")} variant="ghost" size="xs" color="fg.subtle" mt={2}>
                        Change Role
                    </Button>
                 </Box>

                 <HStack gap={2}>
                    <ColorModeButton />
                    <VStack align="end" gap={2}>
                      <Button onClick={handleSelectFolder} colorPalette="blue">
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
  );
}

export default App;
