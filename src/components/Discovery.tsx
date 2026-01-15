import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { Search, Globe, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { Box, Heading, Button, HStack, Input, VStack, Text, Card, Icon, Spinner } from "@chakra-ui/react";
import { nord } from "../theme";

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
            <Icon color={nord.nord14} asChild><Search /></Icon>
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
                    _hover={{ bg: nord.nord2 }}
                    transition="background 0.2s"
                    bg={nord.nord1}
                    borderColor={nord.nord2}
                >
                    <Card.Body py={4}>
                      <HStack justify="space-between">
                        <HStack gap={4}>
                            <Box w={10} h={10} borderRadius="full" bg={nord.nord2} display="flex" alignItems="center" justifyContent="center">
                                <Icon color={nord.nord14} w={5} h={5} asChild><Globe /></Icon>
                            </Box>
                            <Box>
                                <Text fontWeight="semibold">{host.hostname}</Text>
                                <Text fontSize="xs" color={nord.nord4} fontFamily="mono">{host.ip}:{host.port}</Text>
                            </Box>
                        </HStack>
                        <Icon color={nord.nord3} asChild><ChevronRight /></Icon>
                      </HStack>
                    </Card.Body>
                </Card.Root>
            ))
        ) : (
            <Box textAlign="center" py={12} bg={nord.nord1} borderRadius="xl" borderWidth="1px" borderStyle="dashed" borderColor={nord.nord2}>
                <Text color={nord.nord4}>No hosts discovered yet.</Text>
                <Text fontSize="xs" color={nord.nord3} mt={1}>Make sure your host is on the same network.</Text>
            </Box>
        )}
      </VStack>

      <Box pt={4} borderTopWidth="1px" borderColor={nord.nord1}>
        <Heading size="xs" color={nord.nord4} mb={3} display="flex" alignItems="center" gap={2}>
            <Icon asChild><Plus /></Icon>
            Manual Connection
        </Heading>
        <HStack gap={2}>
            <Input 
                placeholder="IP Address (e.g. 192.168.1.5)" 
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                flex={1}
                bg={nord.nord1}
                borderColor={nord.nord2}
            />
            <Input 
                placeholder="Port" 
                value={manualPort}
                onChange={(e) => setManualPort(e.target.value)}
                w={24}
                bg={nord.nord1}
                borderColor={nord.nord2}
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
