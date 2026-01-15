import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { Search, Globe, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { Box, Heading, Button, HStack, Input, VStack, Text, Card, Icon, Spinner } from "@chakra-ui/react";

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
      const results = await invoke<Host[]>("discover_hosts");
      setHosts(results);
    } catch (e) {
      console.error("Discovery error:", e);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    scan();
    const interval = setInterval(scan, 5000);
    return () => clearInterval(interval);
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
            <Icon color="green.500" asChild><Search /></Icon>
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
                    _hover={{ bg: "gray.700" }}
                    transition="background 0.2s"
                    bg="gray.800"
                    borderColor="gray.700"
                >
                    <Card.Body py={4}>
                      <HStack justify="space-between">
                        <HStack gap={4}>
                            <Box w={10} h={10} borderRadius="full" bg="green.900" display="flex" alignItems="center" justifyContent="center">
                                <Icon color="green.500" w={5} h={5} asChild><Globe /></Icon>
                            </Box>
                            <Box>
                                <Text fontWeight="semibold">{host.hostname}</Text>
                                <Text fontSize="xs" color="gray.500" fontFamily="mono">{host.ip}:{host.port}</Text>
                            </Box>
                        </HStack>
                        <Icon color="gray.600" asChild><ChevronRight /></Icon>
                      </HStack>
                    </Card.Body>
                </Card.Root>
            ))
        ) : (
            <Box textAlign="center" py={12} bg="whiteAlpha.50" borderRadius="xl" borderWidth="1px" borderStyle="dashed" borderColor="gray.700">
                <Text color="gray.500">No hosts discovered yet.</Text>
                <Text fontSize="xs" color="gray.600" mt={1}>Make sure your host is on the same network.</Text>
            </Box>
        )}
      </VStack>

      <Box pt={4} borderTopWidth="1px" borderColor="gray.800">
        <Heading size="xs" color="gray.400" mb={3} display="flex" alignItems="center" gap={2}>
            <Icon asChild><Plus /></Icon>
            Manual Connection
        </Heading>
        <HStack gap={2}>
            <Input 
                placeholder="IP Address (e.g. 192.168.1.5)" 
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                flex={1}
                bg="gray.800"
                borderColor="gray.700"
            />
            <Input 
                placeholder="Port" 
                value={manualPort}
                onChange={(e) => setManualPort(e.target.value)}
                w={24}
                bg="gray.800"
                borderColor="gray.700"
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
