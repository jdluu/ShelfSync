import { z } from "zod";

export const BookSchema = z.object({
  id: z.number(),
  title: z.string(),
  authors: z.string(),
  path: z.string(),
  formats: z.array(z.string()).optional(),
  cover_url: z.string().optional(),
  series: z.string().optional(),
  series_index: z.number().optional(),
  tags: z.array(z.string()).optional(),
  publisher: z.string().optional(),

  // Client-side only extensions
  local_path: z.string().optional(),
  remote_id: z.number().optional(),
  format: z.string().optional(),
  read_status: z.enum(["unread", "reading", "finished"]).optional(),
});

export const ConnectionInfoSchema = z.object({
  ip: z.string(),
  port: z.number(),
  hostname: z.string(),
  pin: z.string().optional(),
});
