import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, createLLMClient } from "../llm/provider.js";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

class MockStream extends EventEmitter {
  setEncoding(_encoding: string): this {
    return this;
  }
}

function createMockProcess(params: {
  readonly stdoutChunks?: ReadonlyArray<string>;
  readonly stderrChunks?: ReadonlyArray<string>;
  readonly exitCode?: number;
}): EventEmitter & {
  readonly stdout: MockStream;
  readonly stderr: MockStream;
  readonly kill: ReturnType<typeof vi.fn>;
} {
  const process = new EventEmitter() as EventEmitter & {
    readonly stdout: MockStream;
    readonly stderr: MockStream;
    readonly kill: ReturnType<typeof vi.fn>;
  };
  Object.defineProperties(process, {
    stdout: { value: new MockStream(), enumerable: true },
    stderr: { value: new MockStream(), enumerable: true },
    kill: { value: vi.fn(), enumerable: true },
  });

  queueMicrotask(() => {
    for (const chunk of params.stdoutChunks ?? []) {
      process.stdout.emit("data", chunk);
    }
    for (const chunk of params.stderrChunks ?? []) {
      process.stderr.emit("data", chunk);
    }
    process.emit("close", params.exitCode ?? 0);
  });

  return process;
}

describe("CLI-backed provider transport", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("routes GPT models through codex and parses JSONL stdout", async () => {
    spawnMock.mockReturnValue(createMockProcess({
      stdoutChunks: [
        "{\"type\":\"thread.started\",\"thread_id\":\"t_123\"}\n",
        "{\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":11,\"output_tokens\":7},\"output\":[{\"content\":[{\"text\":\"hello from codex\"}]}]}}\n",
      ],
    }));

    const client = createLLMClient({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-5.4",
      temperature: 0.7,
      maxTokens: 512,
      apiFormat: "chat",
      stream: true,
      thinkingBudget: 0,
    });

    const result = await chatCompletion(client, "gpt-5.4", [
      { role: "user", content: "ping" },
    ]);

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["exec", "--model", "gpt-5.4", "--full-auto", "--json", expect.any(String)]),
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );
    expect(result.content).toBe("hello from codex");
    expect(result.usage).toEqual({
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    });
  });

  it("routes Claude models through claude and parses result JSON", async () => {
    spawnMock.mockReturnValue(createMockProcess({
      stdoutChunks: [
        "{\"type\":\"result\",\"subtype\":\"success\",\"result\":\"claude reply\",\"usage\":{\"input_tokens\":9,\"output_tokens\":5}}\n",
      ],
    }));

    const client = createLLMClient({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "claude-sonnet-4-5",
      temperature: 0.7,
      maxTokens: 512,
      apiFormat: "chat",
      stream: true,
      thinkingBudget: 0,
    });

    const result = await chatCompletion(client, "claude-sonnet-4-5", [
      { role: "user", content: "ping" },
    ]);

    expect(spawnMock).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p", "--model", "claude-sonnet-4-5", "--output-format", "json", expect.any(String)]),
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );
    expect(result.content).toBe("claude reply");
    expect(result.usage).toEqual({
      promptTokens: 9,
      completionTokens: 5,
      totalTokens: 14,
    });
  });

  it("turns CLI authentication prompts into actionable errors", async () => {
    spawnMock.mockReturnValue(createMockProcess({
      stdoutChunks: ["Opening authentication page in your browser. Do you want to continue? [Y/n]: "],
      exitCode: 1,
    }));

    const client = createLLMClient({
      provider: "custom",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "",
      model: "gemini-2.5-pro",
      temperature: 0.7,
      maxTokens: 512,
      apiFormat: "chat",
      stream: true,
      thinkingBudget: 0,
    });

    await expect(chatCompletion(client, "gemini-2.5-pro", [
      { role: "user", content: "ping" },
    ])).rejects.toThrow(/尚未完成认证/);
  });
});
