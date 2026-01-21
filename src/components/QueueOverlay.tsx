import React from 'react';
import { Box, HStack, VStack, Text, Progress, Icon, Portal } from "@chakra-ui/react";
import { Download, CheckCircle, AlertCircle } from "lucide-react";


interface QueueOverlayProps {
    progress: Record<number, any>;
    onClose?: () => void;
}

export const QueueOverlay: React.FC<QueueOverlayProps> = ({ progress }) => {
    // Get all active or recently completed items
    const items = Object.values(progress).filter((p: any) => p.status !== "idle");
    
    // Sort to show active first
    items.sort((a: any, b: any) => {
        if (a.status === "downloading") return -1;
        if (b.status === "downloading") return 1;
        return 0;
    });

    if (items.length === 0) return null;

    const completedCount = items.filter((p: any) => p.status === "completed").length;
    const totalCount = items.length;

    return (
        <Portal>
            <Box 
                position="fixed" 
                bottom={6} 
                right={6} 
                zIndex={3000}
                w="320px"
                maxH="400px"
                bg="bg.panel"
                borderRadius="xl"
                boxShadow="2xl"
                borderWidth="1px"
                borderColor="border"
                overflow="hidden"
                display="flex"
                flexDirection="column"
                backdropFilter="blur(10px)"
            >
                <Box p={4} borderBottomWidth="1px" bg="bg.subtle">
                    <HStack justify="space-between">
                        <HStack gap={2}>
                            <Icon as={Download} color="blue.500" />
                            <VStack align="start" gap={0}>
                                <Text fontWeight="bold" fontSize="sm">Sync Progress</Text>
                                <Text fontSize="xs" color="fg.muted">
                                    {completedCount} of {totalCount} syncs finished
                                </Text>
                            </VStack>
                        </HStack>
                    </HStack>
                </Box>

                <VStack p={2} gap={2} align="stretch" overflowY="auto">
                    {items.slice(0, 5).map((p: any) => (
                        <Box key={p.book_id} p={3} borderRadius="lg" bg="bg.muted">
                            <VStack align="stretch" gap={2}>
                                <HStack justify="space-between" w="full">
                                    <Text fontSize="xs" fontWeight="semibold" truncate maxW="200px">
                                        {p.title}
                                    </Text>
                                    <StatusIcon status={p.status} />
                                </HStack>

                                {p.status === "downloading" && (
                                    <VStack gap={1} align="stretch">
                                        <Progress.Root value={p.progress * 100} size="xs" colorPalette="blue" borderRadius="full">
                                            <Progress.Track />
                                        </Progress.Root>
                                        <HStack justify="space-between">
                                            <Text fontSize="10px" color="fg.subtle">Downloading...</Text>
                                            <Text fontSize="10px" color="fg.subtle">{Math.round(p.progress * 100)}%</Text>
                                        </HStack>
                                    </VStack>
                                )}
                            </VStack>
                        </Box>
                    ))}
                    {items.length > 5 && (
                        <Text fontSize="xs" textAlign="center" py={1} color="fg.subtle">
                            + {items.length - 5} more in queue
                        </Text>
                    )}
                </VStack>
            </Box>
        </Portal>
    );
};

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
    if (status === "completed") return <Icon as={CheckCircle} color="green.500" size="sm" />;
    if (status === "error") return <Icon as={AlertCircle} color="red.500" size="sm" />;
    return <Box className="spinner" w="12px" h="12px" border="2px solid" borderTopColor="blue.500" borderColor="gray.200" borderRadius="full" />;
};
