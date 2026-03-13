import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createLLMClient, type ProjectConfig, ProjectConfigSchema } from "@actalk/inkos-core";

export async function resolveContext(opts: {
  readonly context?: string;
  readonly contextFile?: string;
}): Promise<string | undefined> {
  if (opts.context) return opts.context;
  if (opts.contextFile) {
    return readFile(resolve(opts.contextFile), "utf-8");
  }
  // Read from stdin if piped (non-TTY)
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf-8").trim();
    if (text.length > 0) return text;
  }
  return undefined;
}

export function findProjectRoot(): string {
  return process.cwd();
}

export async function loadConfig(): Promise<ProjectConfig> {
  const root = findProjectRoot();

  // Load .env from project root
  loadEnv({ path: join(root, ".env") });

  const configPath = join(root, "inkos.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    // .env overrides inkos.json for LLM settings
    const env = process.env;
    if (env.INKOS_LLM_PROVIDER) config.llm.provider = env.INKOS_LLM_PROVIDER;
    if (env.INKOS_LLM_BASE_URL) config.llm.baseUrl = env.INKOS_LLM_BASE_URL;
    if (env.INKOS_LLM_MODEL) config.llm.model = env.INKOS_LLM_MODEL;
    if (env.INKOS_LLM_TEMPERATURE) config.llm.temperature = parseFloat(env.INKOS_LLM_TEMPERATURE);
    if (env.INKOS_LLM_MAX_TOKENS) config.llm.maxTokens = parseInt(env.INKOS_LLM_MAX_TOKENS, 10);
    if (env.INKOS_LLM_THINKING_BUDGET) config.llm.thinkingBudget = parseInt(env.INKOS_LLM_THINKING_BUDGET, 10);
    if (env.INKOS_LLM_API_FORMAT) config.llm.apiFormat = env.INKOS_LLM_API_FORMAT;

    // API key ONLY from env — never stored in inkos.json
    const apiKey = env.INKOS_LLM_API_KEY;
    if (!apiKey) {
      throw new Error(
        "INKOS_LLM_API_KEY not set. Add it to your .env file.",
      );
    }
    config.llm.apiKey = apiKey;

    return ProjectConfigSchema.parse(config);
  } catch (e) {
    throw new Error(
      `Failed to load inkos.json from ${root}. Run 'inkos init' first.`,
    );
  }
}

export function createClient(config: ProjectConfig) {
  return createLLMClient(config.llm);
}

export function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function logError(message: string): void {
  process.stderr.write(`[ERROR] ${message}\n`);
}
