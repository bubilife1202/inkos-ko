import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { LLMConfig } from "../models/project.js";

// === Streaming Monitor Types ===

export interface StreamProgress {
  readonly elapsedMs: number;
  readonly totalChars: number;
  readonly chineseChars: number;
  readonly status: "streaming" | "done";
}

export type OnStreamProgress = (progress: StreamProgress) => void;

export function createStreamMonitor(
  onProgress?: OnStreamProgress,
  intervalMs: number = 30000,
): { readonly onChunk: (text: string) => void; readonly stop: () => void } {
  let totalChars = 0;
  let chineseChars = 0;
  const startTime = Date.now();
  let timer: ReturnType<typeof setInterval> | undefined;

  if (onProgress) {
    timer = setInterval(() => {
      onProgress({
        elapsedMs: Date.now() - startTime,
        totalChars,
        chineseChars,
        status: "streaming",
      });
    }, intervalMs);
  }

  return {
    onChunk(text: string): void {
      totalChars += text.length;
      chineseChars += (text.match(/[\u4e00-\u9fff]/g) || []).length;
    },
    stop(): void {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      onProgress?.({
        elapsedMs: Date.now() - startTime,
        totalChars,
        chineseChars,
        status: "done",
      });
    },
  };
}

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
  readonly apiFormat: "chat" | "responses";
  readonly stream: boolean;
  readonly _openai?: unknown;
  readonly _anthropic?: unknown;
  readonly baseUrl?: string;
  readonly configProvider?: "anthropic" | "openai" | "custom";
  readonly supportsNativeWebSearch?: boolean;
  readonly defaults: {
    readonly temperature: number;
    readonly maxTokens: number;
    readonly maxTokensCap: number | null; // non-null only when user explicitly configured
    readonly thinkingBudget: number;
    readonly extra: Record<string, unknown>;
  };
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

type CLIProvider = "openai" | "anthropic" | "gemini";
type CLIOutputFormat = "json" | "jsonl";

interface CLICommandSpec {
  readonly provider: CLIProvider;
  readonly command: string;
  readonly args: readonly string[];
  readonly outputFormat: CLIOutputFormat;
}

interface CLIInvocationResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface CLIParseResult {
  readonly content: string;
  readonly usage: LLMResponse["usage"];
}

// === Factory ===

export function createLLMClient(config: LLMConfig): LLMClient {
  const defaults = {
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 8192,
    maxTokensCap: config.maxTokens ?? null,
    thinkingBudget: config.thinkingBudget ?? 0,
    extra: config.extra ?? {},
  };

  return {
    provider: config.provider === "anthropic" ? "anthropic" : "openai",
    apiFormat: config.apiFormat ?? "chat",
    stream: config.stream ?? true,
    baseUrl: config.baseUrl,
    configProvider: config.provider,
    supportsNativeWebSearch: false,
    defaults,
  };
}

// === Partial Response (kept for interface compatibility) ===

export class PartialResponseError extends Error {
  readonly partialContent: string;
  constructor(partialContent: string, cause: unknown) {
    super(`Stream interrupted after ${partialContent.length} chars: ${String(cause)}`);
    this.name = "PartialResponseError";
    this.partialContent = partialContent;
  }
}

// === CLI Error Wrapping ===

class CLIInvocationError extends Error {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;

  constructor(params: {
    readonly command: string;
    readonly exitCode?: number | null;
    readonly stdout?: string;
    readonly stderr?: string;
    readonly timedOut?: boolean;
    readonly cause?: unknown;
  }) {
    const base = params.timedOut
      ? `CLI command timed out: ${params.command}`
      : `CLI command failed: ${params.command}`;
    super(base, params.cause ? { cause: params.cause } : undefined);
    this.name = "CLIInvocationError";
    this.command = params.command;
    this.exitCode = params.exitCode ?? null;
    this.stdout = params.stdout ?? "";
    this.stderr = params.stderr ?? "";
    this.timedOut = params.timedOut ?? false;
  }
}

function wrapLLMError(error: unknown, context?: { readonly command?: string; readonly model?: string }): Error {
  const msg = String(error);
  const ctxLine = context
    ? `\n  (command: ${context.command ?? "unknown"}, model: ${context.model ?? "unknown"})`
    : "";

  if (error instanceof CLIInvocationError) {
    const combined = `${error.stderr}\n${error.stdout}`.trim();
    const snippet = trimForError(combined);
    const commandName = context?.command ?? error.command.split(" ")[0] ?? "llm-cli";

    if (msg.includes("ENOENT")) {
      return new Error(
        `未找到 LLM CLI：${commandName}。请确认它已安装并且在 PATH 中。${ctxLine}`,
      );
    }
    if (
      /not logged in|please run \/login|authentication page|open(?:ing)? authentication page|browser|auth/i.test(combined)
    ) {
      return new Error(
        `LLM CLI '${commandName}' 尚未完成认证。请先在终端登录该 CLI，再重试。${ctxLine}` +
        (snippet ? `\n  输出：${snippet}` : ""),
      );
    }
    if (error.timedOut) {
      return new Error(
        `LLM CLI '${commandName}' 执行超时。请检查 CLI 是否卡在登录/交互提示，或适当增大 INKOS_LLM_CLI_TIMEOUT_MS。${ctxLine}` +
        (snippet ? `\n  输出：${snippet}` : ""),
      );
    }
    return new Error(
      `LLM CLI '${commandName}' 执行失败` +
      (error.exitCode !== null ? ` (exit ${error.exitCode})` : "") +
      `${ctxLine}` +
      (snippet ? `\n  输出：${snippet}` : ""),
    );
  }

  if (msg.includes("401") || msg.includes("403")) {
    return new Error(
      `LLM CLI 调用被拒绝，可能是 CLI 登录状态失效或订阅无权限。${ctxLine}`,
    );
  }
  return error instanceof Error ? error : new Error(msg);
}

function trimForError(output: string, maxLength: number = 500): string {
  const normalized = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" | ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

// === Simple Chat (used by all agents via BaseAgent.chat()) ===

export async function chatCompletion(
  client: LLMClient,
  model: string,
  messages: ReadonlyArray<LLMMessage>,
  options?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly webSearch?: boolean;
    readonly onStreamProgress?: OnStreamProgress;
  },
): Promise<LLMResponse> {
  const perCallMax = options?.maxTokens ?? client.defaults.maxTokens;
  const cap = client.defaults.maxTokensCap;
  const resolved = {
    temperature: options?.temperature ?? client.defaults.temperature,
    maxTokens: cap !== null ? Math.min(perCallMax, cap) : perCallMax,
  };
  const prompt = buildChatPrompt(messages, resolved, options?.webSearch ?? false);
  const spec = buildCLICommand(client, model, prompt);
  const monitor = createStreamMonitor(options?.onStreamProgress);

  try {
    const result = await runCLI(spec);
    const parsed = parseCLIResult(spec, result.stdout);
    if (!parsed.content) {
      throw new Error("LLM returned empty response");
    }
    monitor.onChunk(parsed.content);
    return parsed;
  } catch (error) {
    throw wrapLLMError(error, {
      command: spec.command,
      model,
    });
  } finally {
    monitor.stop();
  }
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
  const resolved = {
    temperature: options?.temperature ?? client.defaults.temperature,
    maxTokens: options?.maxTokens ?? client.defaults.maxTokens,
  };
  const prompt = buildToolPrompt(messages, tools, resolved);
  const spec = buildCLICommand(client, model, prompt);

  try {
    const result = await runCLI(spec);
    const parsed = parseCLIResult(spec, result.stdout);
    return parseToolResponse(parsed.content);
  } catch (error) {
    throw wrapLLMError(error, {
      command: spec.command,
      model,
    });
  }
}

function buildChatPrompt(
  messages: ReadonlyArray<LLMMessage>,
  options: { readonly temperature: number; readonly maxTokens: number },
  webSearch: boolean,
): string {
  return [
    "You are the assistant in the following conversation.",
    "Follow all system instructions exactly.",
    "Do not use built-in tools, shell commands, file operations, or network access.",
    "Return only the assistant's reply text. Do not wrap the answer in JSON or markdown fences.",
    webSearch
      ? "Web search is not available through this transport. Use only the supplied conversation context."
      : undefined,
    `Requested temperature: ${options.temperature}`,
    `Requested max output tokens: ${options.maxTokens}`,
    "",
    "<conversation>",
    renderLLMMessages(messages),
    "</conversation>",
    "",
    "<assistant_reply>",
  ].filter((line): line is string => line !== undefined).join("\n");
}

function buildToolPrompt(
  messages: ReadonlyArray<AgentMessage>,
  tools: ReadonlyArray<ToolDefinition>,
  options: { readonly temperature: number; readonly maxTokens: number },
): string {
  return [
    "You are a tool-using assistant inside InkOS.",
    "Decide whether to answer directly or request one or more tools.",
    "Never invent tool results.",
    "Do not use built-in CLI tools, shell commands, file operations, or network access.",
    "Return exactly one JSON object and nothing else.",
    "The JSON schema is:",
    "{\"content\":\"string\",\"toolCalls\":[{\"name\":\"string\",\"arguments\":{}}]}",
    "Rules:",
    "- `toolCalls` must be an empty array when no tool is needed.",
    "- `arguments` must be an object, not a JSON-encoded string.",
    "- `content` may be empty when you only need tools.",
    `Requested temperature: ${options.temperature}`,
    `Requested max output tokens: ${options.maxTokens}`,
    "",
    "<available_tools>",
    JSON.stringify(tools, null, 2),
    "</available_tools>",
    "",
    "<conversation>",
    renderAgentMessages(messages),
    "</conversation>",
  ].join("\n");
}

function renderLLMMessages(messages: ReadonlyArray<LLMMessage>): string {
  return messages
    .map((message) => [
      `<message role="${message.role}">`,
      message.content,
      "</message>",
    ].join("\n"))
    .join("\n");
}

function renderAgentMessages(messages: ReadonlyArray<AgentMessage>): string {
  return messages.map((message) => {
    if (message.role === "tool") {
      return [
        `<message role="tool" tool_call_id="${message.toolCallId}">`,
        message.content,
        "</message>",
      ].join("\n");
    }
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return [
        `<message role="assistant">`,
        message.content ?? "",
        "",
        "<tool_calls>",
        JSON.stringify(message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          arguments: safeJsonParse(toolCall.arguments) ?? toolCall.arguments,
        })), null, 2),
        "</tool_calls>",
        "</message>",
      ].join("\n");
    }
    return [
      `<message role="${message.role}">`,
      "content" in message && message.content ? message.content : "",
      "</message>",
    ].join("\n");
  }).join("\n");
}

function buildCLICommand(client: LLMClient, model: string, prompt: string): CLICommandSpec {
  const provider = resolveCLIProvider(client, model);

  switch (provider) {
    case "gemini":
      return {
        provider,
        command: "gemini",
        args: ["--model", model, "-p", prompt, "--yolo", "--output-format", "json"],
        outputFormat: "json",
      };
    case "anthropic":
      return {
        provider,
        command: "claude",
        args: ["-p", "--model", model, "--output-format", "json", prompt],
        outputFormat: "json",
      };
    case "openai":
      return {
        provider,
        command: "codex",
        args: ["exec", "--model", model, "--full-auto", "--json", prompt],
        outputFormat: "jsonl",
      };
  }
}

function resolveCLIProvider(client: LLMClient, model: string): CLIProvider {
  const normalizedModel = model.toLowerCase();

  if (normalizedModel.includes("gemini")) {
    return "gemini";
  }
  if (normalizedModel.includes("claude")) {
    return "anthropic";
  }
  if (/^(gpt|o\d|chatgpt|codex)/.test(normalizedModel)) {
    return "openai";
  }

  if (client.configProvider === "anthropic") {
    return "anthropic";
  }
  if (client.configProvider === "openai") {
    return "openai";
  }

  throw new Error(
    `Unsupported LLM model '${model}'. Only Gemini, GPT/Codex, and Claude models are supported by the CLI transport.`,
  );
}

async function runCLI(spec: CLICommandSpec): Promise<CLIInvocationResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: process.env.NO_COLOR ?? "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const finalizeReject = (error: unknown): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    };

    const finalizeResolve = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ stdout, stderr });
    };

    const timeoutMs = getCLITimeoutMs();
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
      }, 5000).unref();
      finalizeReject(new CLIInvocationError({
        command: formatCommand(spec.command, spec.args),
        stdout,
        stderr,
        timedOut: true,
      }));
    }, timeoutMs);
    timer.unref();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (looksInteractive(chunk)) {
        child.kill("SIGTERM");
        finalizeReject(new CLIInvocationError({
          command: formatCommand(spec.command, spec.args),
          stdout,
          stderr,
        }));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finalizeReject(new CLIInvocationError({
        command: formatCommand(spec.command, spec.args),
        stdout,
        stderr,
        cause: error,
      }));
    });
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        finalizeResolve();
        return;
      }
      finalizeReject(new CLIInvocationError({
        command: formatCommand(spec.command, spec.args),
        exitCode,
        stdout,
        stderr,
      }));
    });
  });
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args.map((arg) => {
    if (/^[a-zA-Z0-9_./:-]+$/.test(arg)) return arg;
    return JSON.stringify(arg);
  })].join(" ");
}

function looksInteractive(chunk: string): boolean {
  return /do you want to continue\?|press enter|open(?:ing)? authentication page|login in your browser/i.test(chunk);
}

function getCLITimeoutMs(): number {
  const raw = process.env.INKOS_LLM_CLI_TIMEOUT_MS;
  if (!raw) return 30 * 60 * 1000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
}

function parseCLIResult(spec: CLICommandSpec, stdout: string): CLIParseResult {
  const payloads = parseJSONPayloads(stdout, spec.outputFormat);
  const usage = extractUsage(payloads);
  const content = extractCLIContent(spec, payloads, stdout);

  if (!content) {
    const raw = stdout.trim();
    if (!raw) {
      throw new Error("LLM CLI returned empty stdout");
    }
    return {
      content: raw,
      usage,
    };
  }

  return {
    content,
    usage,
  };
}

function parseJSONPayloads(stdout: string, outputFormat: CLIOutputFormat): ReadonlyArray<unknown> {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  if (outputFormat === "json") {
    const parsed = safeJsonParse(trimmed);
    return parsed === null ? [] : [parsed];
  }

  const payloads: unknown[] = [];
  for (const line of trimmed.split("\n")) {
    const candidate = line.trim();
    if (!candidate.startsWith("{") && !candidate.startsWith("[")) continue;
    const parsed = safeJsonParse(candidate);
    if (parsed !== null) {
      payloads.push(parsed);
    }
  }
  return payloads;
}

function extractCLIContent(
  spec: CLICommandSpec,
  payloads: ReadonlyArray<unknown>,
  stdout: string,
): string {
  const providerSpecific = spec.provider === "openai"
    ? extractCodexContent(payloads)
    : extractGenericContent(payloads[payloads.length - 1]);
  if (providerSpecific) {
    return providerSpecific;
  }

  const fenced = stripMarkdownFences(stdout.trim());
  if (fenced) {
    return fenced;
  }
  return "";
}

function extractCodexContent(payloads: ReadonlyArray<unknown>): string {
  const finalCandidates: string[] = [];
  const deltaCandidates: string[] = [];

  for (const payload of payloads) {
    if (!isRecord(payload)) continue;
    const type = typeof payload.type === "string" ? payload.type : "";

    if (type === "error") {
      continue;
    }

    const exact = extractExactContent(payload);
    if (exact) {
      finalCandidates.push(exact);
      continue;
    }

    if (typeof payload.delta === "string" && payload.delta.trim().length > 0) {
      deltaCandidates.push(payload.delta);
    }
  }

  if (finalCandidates.length > 0) {
    return finalCandidates[finalCandidates.length - 1]!;
  }
  if (deltaCandidates.length > 0) {
    return deltaCandidates.join("");
  }
  return "";
}

function extractGenericContent(payload: unknown): string {
  if (payload === undefined) return "";
  return extractExactContent(payload);
}

function extractExactContent(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.trim();
  }
  if (Array.isArray(payload)) {
    const parts = payload
      .map((item) => extractExactContent(item))
      .filter((item) => item.length > 0);
    return parts.join("");
  }
  if (!isRecord(payload)) {
    return "";
  }

  const prioritizedKeys = [
    "result",
    "content",
    "text",
    "message",
    "output_text",
    "output",
    "response",
    "item",
    "candidate",
    "candidates",
    "parts",
  ] as const;

  for (const key of prioritizedKeys) {
    if (!(key in payload)) continue;
    const candidate = extractExactContent(payload[key]);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function extractUsage(payloads: ReadonlyArray<unknown>): LLMResponse["usage"] {
  let best: LLMResponse["usage"] | null = null;

  for (const payload of payloads) {
    visitUsage(payload, (usage) => {
      if (best === null || usage.totalTokens > best.totalTokens) {
        best = usage;
      }
    });
  }

  return best ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function visitUsage(value: unknown, onUsage: (usage: LLMResponse["usage"]) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitUsage(item, onUsage);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const promptTokens = readNumeric(value.input_tokens) ?? readNumeric(value.prompt_tokens);
  const completionTokens = readNumeric(value.output_tokens) ?? readNumeric(value.completion_tokens);
  const totalTokens = readNumeric(value.total_tokens) ?? (
    promptTokens !== null || completionTokens !== null
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : null
  );

  if (promptTokens !== null || completionTokens !== null || totalTokens !== null) {
    onUsage({
      promptTokens: promptTokens ?? 0,
      completionTokens: completionTokens ?? 0,
      totalTokens: totalTokens ?? ((promptTokens ?? 0) + (completionTokens ?? 0)),
    });
  }

  for (const nested of Object.values(value)) {
    visitUsage(nested, onUsage);
  }
}

function readNumeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseToolResponse(content: string): ChatWithToolsResult {
  const parsed = safeJsonParse(stripMarkdownFences(content.trim()));
  if (!isRecord(parsed)) {
    return { content: content.trim(), toolCalls: [] };
  }

  const contentField = typeof parsed.content === "string"
    ? parsed.content
    : extractExactContent(parsed.content);

  const rawToolCalls = Array.isArray(parsed.toolCalls)
    ? parsed.toolCalls
    : [];
  const toolCalls = rawToolCalls
    .map((toolCall) => normalizeToolCall(toolCall))
    .filter((toolCall): toolCall is ToolCall => toolCall !== null);

  return {
    content: contentField.trim(),
    toolCalls,
  };
}

function normalizeToolCall(value: unknown): ToolCall | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) return null;

  let serializedArguments = "{}";
  if (typeof value.arguments === "string") {
    const parsed = safeJsonParse(value.arguments);
    serializedArguments = parsed === null ? value.arguments : JSON.stringify(parsed);
  } else if (value.arguments !== undefined) {
    serializedArguments = JSON.stringify(value.arguments);
  }

  return {
    id: typeof value.id === "string" && value.id.trim().length > 0 ? value.id : randomUUID(),
    name,
    arguments: serializedArguments,
  };
}

function stripMarkdownFences(value: string): string {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? value;
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
