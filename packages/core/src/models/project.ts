import { z } from "zod";

export const LLMConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai", "custom"]),
  baseUrl: z.string().url(),
  apiKey: z.string().default(""),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).default(8192),
  thinkingBudget: z.number().int().min(0).default(0),
  apiFormat: z.enum(["chat", "responses"]).default("chat"),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export const NotifyChannelSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("telegram"),
    botToken: z.string().min(1),
    chatId: z.string().min(1),
  }),
  z.object({
    type: z.literal("wechat-work"),
    webhookUrl: z.string().url(),
  }),
  z.object({
    type: z.literal("feishu"),
    webhookUrl: z.string().url(),
  }),
]);

export type NotifyChannel = z.infer<typeof NotifyChannelSchema>;

export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
  version: z.literal("0.1.0"),
  llm: LLMConfigSchema,
  notify: z.array(NotifyChannelSchema).default([]),
  daemon: z.object({
    schedule: z.object({
      radarCron: z.string().default("0 9 * * *"),
      writeCron: z.string().default("0 14 * * *"),
      auditCron: z.string().default("0 17 * * *"),
    }),
    maxConcurrentBooks: z.number().int().min(1).default(3),
  }).default({
    schedule: {
      radarCron: "0 9 * * *",
      writeCron: "0 14 * * *",
      auditCron: "0 17 * * *",
    },
    maxConcurrentBooks: 3,
  }),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
