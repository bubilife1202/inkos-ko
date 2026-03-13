import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LLMConfig } from "../models/project.js";

// === Shared Types ===

export interface LLMResponse {
  readonly content: string;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export interface LLMMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LLMClient {
  readonly provider: "openai" | "anthropic";
  readonly _openai?: OpenAI;
  readonly _anthropic?: Anthropic;
}

// === Tool-calling Types ===

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export type AgentMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: string | null; readonly toolCalls?: ReadonlyArray<ToolCall> }
  | { readonly role: "tool"; readonly toolCallId: string; readonly content: string };

export interface ChatWithToolsResult {
  readonly content: string;
  readonly toolCalls: ReadonlyArray<ToolCall>;
}

// === Factory ===

export function createLLMClient(config: LLMConfig): LLMClient {
  if (config.provider === "anthropic") {
    // Anthropic SDK appends /v1/ internally — strip if user included it
    const baseURL = config.baseUrl.replace(/\/v1\/?$/, "");
    return {
      provider: "anthropic",
      _anthropic: new Anthropic({ apiKey: config.apiKey, baseURL }),
    };
  }
  // openai or custom — both use OpenAI SDK
  return {
    provider: "openai",
    _openai: new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl }),
  };
}

// === Simple Chat (used by all agents via BaseAgent.chat()) ===

export async function chatCompletion(
  client: LLMClient,
  model: string,
  messages: ReadonlyArray<LLMMessage>,
  options?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
  },
): Promise<LLMResponse> {
  if (client.provider === "anthropic") {
    return chatCompletionAnthropic(client._anthropic!, model, messages, options);
  }
  return chatCompletionOpenAI(client._openai!, model, messages, options);
}

// === Tool-calling Chat (used by agent loop) ===

export async function chatWithTools(
  client: LLMClient,
  model: string,
  messages: ReadonlyArray<AgentMessage>,
  tools: ReadonlyArray<ToolDefinition>,
  options?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
  },
): Promise<ChatWithToolsResult> {
  if (client.provider === "anthropic") {
    return chatWithToolsAnthropic(client._anthropic!, model, messages, tools, options);
  }
  return chatWithToolsOpenAI(client._openai!, model, messages, tools, options);
}

// === OpenAI Implementation ===

async function chatCompletionOpenAI(
  client: OpenAI,
  model: string,
  messages: ReadonlyArray<LLMMessage>,
  options?: { readonly temperature?: number; readonly maxTokens?: number },
): Promise<LLMResponse> {
  const stream = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 8192,
    stream: true,
  });

  const chunks: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) chunks.push(delta);
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? 0;
      completionTokens = chunk.usage.completion_tokens ?? 0;
      totalTokens = chunk.usage.total_tokens ?? 0;
    }
  }

  const content = chunks.join("");
  if (!content) throw new Error("LLM returned empty response");

  return { content, usage: { promptTokens, completionTokens, totalTokens } };
}

async function chatWithToolsOpenAI(
  client: OpenAI,
  model: string,
  messages: ReadonlyArray<AgentMessage>,
  tools: ReadonlyArray<ToolDefinition>,
  options?: { readonly temperature?: number; readonly maxTokens?: number },
): Promise<ChatWithToolsResult> {
  const openaiMessages = messages.map(agentMessageToOpenAI);
  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const stream = await client.chat.completions.create({
    model,
    messages: openaiMessages,
    tools: openaiTools,
    tool_choice: "auto",
    stream: true,
  });

  let content = "";
  const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;
    if (delta.content) content += delta.content;
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = toolCallMap.get(tc.index);
        if (existing) {
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        } else {
          toolCallMap.set(tc.index, {
            id: tc.id ?? "",
            name: tc.function?.name ?? "",
            arguments: tc.function?.arguments ?? "",
          });
        }
      }
    }
  }

  const toolCalls = [...toolCallMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({ id: tc.id, name: tc.name, arguments: tc.arguments }));

  return { content, toolCalls };
}

function agentMessageToOpenAI(msg: AgentMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (msg.role === "system") return { role: "system", content: msg.content };
  if (msg.role === "user") return { role: "user", content: msg.content };
  if (msg.role === "tool") return { role: "tool", content: msg.content, tool_call_id: msg.toolCallId };
  // assistant
  if (msg.toolCalls && msg.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: msg.content,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  return { role: "assistant", content: msg.content };
}

// === Anthropic Implementation ===

async function chatCompletionAnthropic(
  client: Anthropic,
  model: string,
  messages: ReadonlyArray<LLMMessage>,
  options?: { readonly temperature?: number; readonly maxTokens?: number },
): Promise<LLMResponse> {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const stream = await client.messages.create({
    model,
    ...(systemText ? { system: systemText } : {}),
    messages: nonSystem.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 8192,
    stream: true,
  });

  const chunks: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      chunks.push(event.delta.text);
    }
    if (event.type === "message_start") {
      inputTokens = event.message.usage?.input_tokens ?? 0;
    }
    if (event.type === "message_delta") {
      outputTokens = ((event as unknown as { usage?: { output_tokens?: number } }).usage?.output_tokens) ?? 0;
    }
  }

  const content = chunks.join("");
  if (!content) throw new Error("LLM returned empty response");

  return {
    content,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  };
}

async function chatWithToolsAnthropic(
  client: Anthropic,
  model: string,
  messages: ReadonlyArray<AgentMessage>,
  tools: ReadonlyArray<ToolDefinition>,
  options?: { readonly temperature?: number; readonly maxTokens?: number },
): Promise<ChatWithToolsResult> {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => (m as { content: string }).content)
    .join("\n\n");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const anthropicMessages = agentMessagesToAnthropic(nonSystem);
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
  }));

  const stream = await client.messages.create({
    model,
    ...(systemText ? { system: systemText } : {}),
    messages: anthropicMessages,
    tools: anthropicTools,
    max_tokens: options?.maxTokens ?? 8192,
    stream: true,
  });

  let content = "";
  const toolCalls: ToolCall[] = [];
  let currentBlock: { id: string; name: string; input: string } | null = null;

  for await (const event of stream) {
    if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
      currentBlock = {
        id: event.content_block.id,
        name: event.content_block.name,
        input: "",
      };
    }
    if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        content += event.delta.text;
      }
      if (event.delta.type === "input_json_delta" && currentBlock) {
        currentBlock.input += event.delta.partial_json;
      }
    }
    if (event.type === "content_block_stop" && currentBlock) {
      toolCalls.push({
        id: currentBlock.id,
        name: currentBlock.name,
        arguments: currentBlock.input,
      });
      currentBlock = null;
    }
  }

  return { content, toolCalls };
}

function agentMessagesToAnthropic(
  messages: ReadonlyArray<AgentMessage>,
): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const blocks: Anthropic.Messages.ContentBlockParam[] = [];
      if (msg.content) {
        blocks.push({ type: "text", text: msg.content });
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments),
          });
        }
      }
      if (blocks.length === 0) {
        blocks.push({ type: "text", text: "" });
      }
      result.push({ role: "assistant", content: blocks });
      continue;
    }

    if (msg.role === "tool") {
      const toolResult: Anthropic.Messages.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: msg.content,
      };
      // Merge consecutive tool results into one user message (Anthropic requires alternating roles)
      const prev = result[result.length - 1];
      if (prev && prev.role === "user" && Array.isArray(prev.content)) {
        (prev.content as Anthropic.Messages.ToolResultBlockParam[]).push(toolResult);
      } else {
        result.push({ role: "user", content: [toolResult] });
      }
    }
  }

  return result;
}
