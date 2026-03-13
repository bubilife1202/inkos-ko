import type { LLMClient, LLMMessage, LLMResponse } from "../llm/provider.js";
import { chatCompletion } from "../llm/provider.js";

export interface AgentContext {
  readonly client: LLMClient;
  readonly model: string;
  readonly projectRoot: string;
  readonly bookId?: string;
}

export abstract class BaseAgent {
  protected readonly ctx: AgentContext;

  constructor(ctx: AgentContext) {
    this.ctx = ctx;
  }

  protected async chat(
    messages: ReadonlyArray<LLMMessage>,
    options?: { readonly temperature?: number; readonly maxTokens?: number },
  ): Promise<LLMResponse> {
    return chatCompletion(this.ctx.client, this.ctx.model, messages, options);
  }

  abstract get name(): string;
}
