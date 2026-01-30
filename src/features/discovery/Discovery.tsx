import React, { useState } from 'react';
import { Search, Globe, ChevronRight, RefreshCw, Plus, WifiOff } from 'lucide-react';
import { Box, Heading, Button, HStack, Input, VStack, Text, Card, Icon, Spinner, Badge } from "@chakra-ui/react";
import { useDiscovery } from "@/context/DiscoveryContext";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/Feedback/LoadingSpinner";

interface Host {
  ip: string;
  port: number;
  hostname: string;
}

interface DiscoveryProps {
  onConnect: (host: Host) => void;
}

export const Discovery: React.FC<DiscoveryProps> = ({ onConnect }) => {
  const { hosts, scanning, scan, knownHosts } = useDiscovery();
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("8080");

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
        {scanning && hosts.length === 0 ? (
            <LoadingSpinner message="Searching for local hosts..." />
        ) : hosts.length > 0 ? (
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
            <EmptyState 
                icon={WifiOff}
                title="No Hosts Found"
                description="Check if the ShelfSync Host is running on the same network."
                actionLabel="Scan Again"
                onAction={scan}
            />
        )}
      </VStack>

      {knownHosts.length > 0 && !scanning && hosts.length === 0 && (
          <VStack align="stretch" gap={3}>
              <Heading size="xs" color="fg.muted">Previous Connections</Heading>
              {knownHosts.map(host => (
                  <Card.Root 
                    key={`history-${host.ip}`} 
                    size="sm" 
                    variant="subtle"
                    onClick={() => onConnect(host)}
                    cursor="pointer"
                    _hover={{ bg: "bg.muted" }}
                  >
                      <Card.Body px={4} py={3}>
                          <HStack justify="space-between">
                              <VStack align="start" gap={0}>
                                  <Text fontSize="sm" fontWeight="medium">{host.hostname}</Text>
                                  <Text fontSize="10px" color="fg.subtle">{host.ip}</Text>
                              </VStack>
                              <Badge size="xs" variant="surface">History</Badge>
                          </HStack>
                      </Card.Body>
                  </Card.Root>
              ))}
          </VStack>
      )}

      <Box pt={4} borderTopWidth="1px" borderColor="border.subtle">
        <Heading size="xs" color="fg.muted" mb={3} display="flex" alignItems="center" gap={2}>
            <Icon asChild><Plus /></Icon>
            Manual Connection
        </Heading>
        <HStack gap={2}>
            <Input 
                placeholder="IP Address" 
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
