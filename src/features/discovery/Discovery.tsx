import React, { useState, useEffect } from 'react';
import { listen } from "@tauri-apps/api/event";
import { Search, Globe, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { Box, Heading, Button, HStack, Input, VStack, Text, Card, Icon, Spinner } from "@chakra-ui/react";
import { api } from "@/services/api";

interface Host {
  ip: string;
  port: number;
  hostname: string;
}

interface DiscoveryProps {
  onConnect: (host: Host) => void;
}

export const Discovery: React.FC<DiscoveryProps> = ({ onConnect }) => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("8080");

  const scan = async () => {
    setScanning(true);
    try {
      const results = await api.network.discoverHosts();
      setHosts(results);
    } catch (e) {
      console.error("Discovery error:", e);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    scan();
    
    // Set up event listener for real-time updates
    const unlistenPromise = listen<Host[]>("discovery-update", (event) => {
        setHosts(event.payload);
    });

    return () => {
        unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const handleManualConnect = () => {
    if (manualIp) {
      onConnect({
        ip: manualIp,
        port: parseInt(manualPort),
        hostname: "Manual Connection"
      });
    }
  };

  return (
    <VStack gap={8} align="stretch">
      <HStack justify="space-between">
        <Heading size="lg" display="flex" alignItems="center" gap={2}>
            <Icon color="success" asChild><Search /></Icon>
            Discover Hosts
        </Heading>
        <Button 
            onClick={scan}
            disabled={scanning}
            variant="surface"
            size="sm"
        >
            {scanning ? <Spinner size="sm" /> : <Icon asChild><RefreshCw /></Icon>}
            Refresh
        </Button>
      </HStack>

      <VStack gap={4} align="stretch">
        {hosts.length > 0 ? (
            hosts.map((host) => (
                <Card.Root
                    key={`${host.ip}:${host.port}`}
                    onClick={() => onConnect(host)}
                    cursor="pointer"
                    _hover={{ bg: "bg.muted" }}
                    transition="background 0.2s"
                    bg="bg.subtle"
                    borderColor="border"
                >
                    <Card.Body py={4}>
                      <HStack justify="space-between">
                        <HStack gap={4}>
                            <Box w={10} h={10} borderRadius="full" bg="bg.muted" display="flex" alignItems="center" justifyContent="center">
                                <Icon color="success" w={5} h={5} asChild><Globe /></Icon>
                            </Box>
                            <Box>
                                <Text fontWeight="semibold">{host.hostname}</Text>
                                <Text fontSize="xs" color="fg.muted" fontFamily="mono">{host.ip}:{host.port}</Text>
                            </Box>
                        </HStack>
                        <Icon color="fg.subtle" asChild><ChevronRight /></Icon>
                      </HStack>
                    </Card.Body>
                </Card.Root>
            ))
        ) : (
            <Box textAlign="center" py={12} bg="bg.subtle" borderRadius="xl" borderWidth="1px" borderStyle="dashed" borderColor="border">
                <Text color="fg.muted">No hosts discovered yet.</Text>
                <Text fontSize="xs" color="fg.subtle" mt={1}>Make sure your host is on the same network.</Text>
            </Box>
        )}
      </VStack>

      <Box pt={4} borderTopWidth="1px" borderColor="border.subtle">
        <Heading size="xs" color="fg.muted" mb={3} display="flex" alignItems="center" gap={2}>
            <Icon asChild><Plus /></Icon>
            Manual Connection
        </Heading>
        <HStack gap={2}>
            <Input 
                placeholder="IP Address (e.g. 192.168.1.5)" 
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                flex={1}
                bg="bg.subtle"
                borderColor="border"
            />
            <Input 
                placeholder="Port" 
                value={manualPort}
                onChange={(e) => setManualPort(e.target.value)}
                w={24}
                bg="bg.subtle"
                borderColor="border"
            />
            <Button 
                onClick={handleManualConnect}
                disabled={!manualIp}
                colorPalette="green"
            >
                Connect
            </Button>
        </HStack>
      </Box>
    </VStack>
  );
};
