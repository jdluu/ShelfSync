import { z } from "zod";

export const BookSchema = z.object({
  id: z.number(),
  title: z.string(),
  authors: z.string(),
  path: z.string(),
  formats: z.array(z.string()).nullable().optional(),
  cover_url: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  series_index: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  publisher: z.string().nullable().optional(),

  // Client-side only extensions
  local_path: z.string().nullable().optional(),
  remote_id: z.number().nullable().optional(),
  format: z.string().nullable().optional(),
  read_status: z.enum(["unread", "reading", "finished"]).nullable().optional(),
});

export const ConnectionInfoSchema = z.object({
  ip: z.string(),
  port: z.number(),
  hostname: z.string(),
  pin: z.string().optional(),
});
