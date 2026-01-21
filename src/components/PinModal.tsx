import React, { useState } from 'react';
import { 
  Box, VStack, Heading, Text, Input, Button, 
  HStack, Portal, Center 
} from "@chakra-ui/react";
import { Lock } from "lucide-react";

interface PinModalProps {
  hostName: string;
  onPair: (pin: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export const PinModal: React.FC<PinModalProps> = ({ 
  hostName, 
  onPair, 
  onCancel, 
  loading 
}) => {
  const [pin, setPin] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length >= 4) {
      onPair(pin);
    }
  };

  return (
    <Portal>
      <Box 
        position="fixed" 
        top={0} 
        left={0} 
        right={0} 
        bottom={0} 
        bg="blackAlpha.600" 
        backdropFilter="blur(4px)"
        zIndex={1000}
      >
        <Center h="full">
          <Box 
            bg="bg.panel" 
            p={8} 
            borderRadius="xl" 
            boxShadow="2xl" 
            maxW="sm" 
            w="full"
            borderWidth="1px"
            borderColor="border"
          >
            <VStack gap={6} as="form" onSubmit={handleSubmit}>
              <Box bg="accent.subtle" p={4} borderRadius="full">
                <Lock size={32} color="var(--chakra-colors-accent-emphasis)" />
              </Box>
              
              <VStack gap={1} textAlign="center">
                <Heading size="lg">Pairing Required</Heading>
                <Text color="fg.muted" fontSize="sm">
                  Enter the 4-digit PIN displayed on <strong>{hostName}</strong>
                </Text>
              </VStack>

              <Input 
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').substring(0, 4))}
                placeholder="0000"
                size="lg"
                textAlign="center"
                fontSize="2xl"
                fontWeight="bold"
                letterSpacing="widest"
                autoFocus
                disabled={loading}
              />

              <HStack w="full" gap={3}>
                <Button variant="ghost" flex={1} onClick={onCancel} disabled={loading}>
                  Cancel
                </Button>
                <Button 
                  colorPalette="blue" 
                  flex={1} 
                  type="submit" 
                  loading={loading}
                  disabled={pin.length < 4}
                >
                  Pair Device
                </Button>
              </HStack>
            </VStack>
          </Box>
        </Center>
      </Box>
    </Portal>
  );
};
