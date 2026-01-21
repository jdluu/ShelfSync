import React from 'react';
import { VStack, Text, Icon, Heading, Button } from "@chakra-ui/react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
    icon, 
    title, 
    description, 
    actionLabel, 
    onAction 
}) => {
    return (
        <VStack 
            py={12} 
            px={6} 
            gap={4} 
            textAlign="center" 
            bg="bg.muted" 
            borderRadius="2xl" 
            borderWidth="2px"
            borderStyle="dashed"
            borderColor="border"
            w="full"
        >
            <Icon as={icon} w={12} h={12} color="fg.subtle" />
            <VStack gap={1}>
                <Heading size="md">{title}</Heading>
                <Text color="fg.muted" maxW="300px">{description}</Text>
            </VStack>
            {actionLabel && onAction && (
                <Button 
                    variant="surface" 
                    colorPalette="blue" 
                    onClick={onAction}
                    mt={2}
                >
                    {actionLabel}
                </Button>
            )}
        </VStack>
    );
};
