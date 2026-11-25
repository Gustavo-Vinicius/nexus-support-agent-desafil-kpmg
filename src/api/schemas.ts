import { z } from "zod";

export const chatBodySchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export type ChatBody = z.infer<typeof chatBodySchema>;

export const orderIdParamsSchema = z.object({
  id: z.string().min(1),
});
