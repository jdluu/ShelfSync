import React, { useState } from 'react';
import { Card, Box, Image, Heading, Text, VStack, Button, Icon, HStack, Badge, Checkbox, Progress } from "@chakra-ui/react";
import { Book as BookIcon } from "lucide-react";
import { Book } from "@/types";

interface Host {
  ip: string;
  port: number;
}

interface BookCardProps {
  book: Book;
  host?: Host | null;
  variant: "remote" | "local" | "host-view";
  onAction?: (book: Book) => void;
  onToggleStatus?: (book: Book) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  syncStatus?: { progress: number, status: string };
  actionLabel?: string;
  actionColor?: string;
}

export const BookCard: React.FC<BookCardProps> = ({ 
  book, 
  host, 
  variant, 
  onAction, 
  onToggleStatus,
  selectable,
  selected,
  onSelect,
  syncStatus,
  actionLabel, 
  actionColor = "blue" 
}) => {
  const [imgError, setImgError] = useState(false);

  // Construct cover URL if we have a host
  const coverUrl = host 
    ? `http://${host.ip}:${host.port}/api/cover/${book.id}`
    : undefined;

  const getStatusColor = (status?: string) => {
      if (status === 'finished') return "green";
      if (status === 'reading') return "blue";
      return "gray";
  };

  const isDownloading = syncStatus?.status === "downloading";

  return (
    <Card.Root 
        bg={selected ? "blue.subtle" : "bg.subtle"} 
        borderColor={selected ? "blue.500" : "border"} 
        _hover={{ shadow: "md", cursor: selectable ? "pointer" : "default" }} 
        transition="all 0.2s" 
        overflow="hidden"
        onClick={selectable ? onSelect : undefined}
    >
      <Card.Body p={4} position="relative">
        {selectable && (
            <Box position="absolute" top={2} right={2} zIndex={10}>
                <Checkbox.Root checked={selected} colorPalette="blue" size="lg">
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                </Checkbox.Root>
            </Box>
        )}
        <HStack align="start" gap={4}>
          <Box 
            w={20} 
            h={28} 
            bg="bg.muted" 
            borderRadius="md" 
            flexShrink={0} 
            overflow="hidden"
            display="flex" 
            alignItems="center" 
            justifyContent="center"
            position="relative"
            shadow="sm"
          >
            {!imgError && coverUrl ? (
              <Image 
                src={coverUrl} 
                alt={`Cover of ${book.title}`}
                objectFit="cover"
                w="full"
                h="full"
                onError={() => setImgError(true)}
              />
            ) : (
               <Icon color="fg.subtle" w={8} h={8} asChild><BookIcon /></Icon>
            )}

            {isDownloading && (
                <Box 
                    position="absolute" 
                    bottom={0} 
                    left={0} 
                    right={0} 
                    bg="blackAlpha.700" 
                    p={1}
                >
                    <Progress.Root value={syncStatus!.progress * 100} size="sm" colorPalette="blue">
                        <Progress.Track bg="whiteAlpha.300">
                          <Progress.Range />
                        </Progress.Track>
                    </Progress.Root>
                </Box>
            )}
          </Box>
          
          <VStack align="start" gap={1} flex={1} overflow="hidden">
            <Heading size="sm" truncate w="full" title={book.title}>{book.title}</Heading>
            <Text fontSize="sm" color="fg.muted" truncate w="full" title={book.authors}>{book.authors}</Text>
            
            {book.series && (
                <Text fontSize="xs" fontWeight="bold" color="accent.fg" mt={-1}>
                    {book.series} #{book.series_index}
                </Text>
            )}

            {book.tags && book.tags.length > 0 && (
                <HStack wrap="wrap" gap={1} mt={1}>
                    {book.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} size="xs" variant="surface" colorPalette="gray" fontSize="9px">
                            {tag}
                        </Badge>
                    ))}
                    {book.tags.length > 3 && (
                        <Text fontSize="10px" color="fg.subtle">+{book.tags.length - 3}</Text>
                    )}
                </HStack>
            )}
            
            {variant === "host-view" && (
                <Text fontSize="xs" color="fg.subtle" fontFamily="mono" wordBreak="break-all" lineClamp={2}>
                    {book.path}
                </Text>
            )}

            {variant === "local" && (
                <HStack mt={1}>
                    <Badge size="sm" variant="surface" colorPalette="gray">Downloaded</Badge>
                    {onToggleStatus && (
                        <Badge 
                            size="sm" 
                            variant="solid" 
                            colorPalette={getStatusColor(book.read_status)}
                            cursor="pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleStatus(book);
                            }}
                        >
                            {book.read_status || 'unread'}
                        </Badge>
                    )}
                </HStack>
            )}

            {variant === "remote" && book.formats && (
               <HStack mt={1} wrap="wrap" gap={1}>
                  {book.formats.map(fmt => (
                      <Badge key={fmt} size="xs" variant="outline" colorPalette="blue">
                          {fmt.toUpperCase()}
                      </Badge>
                  ))}
               </HStack>
            )}

            {variant === "remote" && (
                <HStack w="full" mt={2} gap={2}>
                    {onAction && (
                        <Button 
                          size="xs" 
                          colorPalette="blue" 
                          flex={1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction(book);
                          }}
                          disabled={isDownloading}
                          loading={isDownloading}
                        >
                          {isDownloading ? "Syncing..." : "Sync"}
                        </Button>
                    )}
                </HStack>
            )}

            {variant === "local" && onAction && actionLabel && (
                <Button 
                  size="xs" 
                  colorPalette={actionColor} 
                  mt={2}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction(book);
                  }}
                  w="full"
                >
                  {actionLabel}
                </Button>
            )}
          </VStack>
        </HStack>
      </Card.Body>
    </Card.Root>
  );
};
