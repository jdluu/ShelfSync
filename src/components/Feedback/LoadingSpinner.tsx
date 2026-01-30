import { Spinner, Center, Text, VStack } from "@chakra-ui/react";

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = "Loading..." }) => {
  return (
    <Center h="100%" minH="200px">
      <VStack gap={4}>
        <Spinner size="xl" color="accent" />
        <Text color="fg.muted">{message}</Text>
      </VStack>
    </Center>
  );
};
