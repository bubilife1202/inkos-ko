import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { log, logError } from "../utils.js";

export const initCommand = new Command("init")
  .description("Initialize a new InkOS project")
  .argument("[name]", "Project name", "my-novel-project")
  .action(async (name: string) => {
    const projectDir = join(process.cwd(), name);

    try {
      await mkdir(projectDir, { recursive: true });
      await mkdir(join(projectDir, "books"), { recursive: true });
      await mkdir(join(projectDir, "radar"), { recursive: true });

      const config = {
        name,
        version: "0.1.0",
        llm: {
          provider: process.env.INKOS_LLM_PROVIDER ?? "openai",
          baseUrl: process.env.INKOS_LLM_BASE_URL ?? "https://api.openai.com/v1",
          model: process.env.INKOS_LLM_MODEL ?? "gpt-4o",
        },
        notify: [],
        daemon: {
          schedule: {
            radarCron: "0 9 * * *",
            writeCron: "0 14 * * *",
            auditCron: "0 17 * * *",
          },
          maxConcurrentBooks: 3,
        },
      };

      await writeFile(
        join(projectDir, "inkos.json"),
        JSON.stringify(config, null, 2),
        "utf-8",
      );

      await writeFile(
        join(projectDir, ".env"),
        [
          "# LLM Configuration",
          "# Provider: openai (OpenAI / compatible proxy), anthropic (Anthropic native)",
          "INKOS_LLM_PROVIDER=openai",
          "INKOS_LLM_BASE_URL=https://api.openai.com/v1",
          "INKOS_LLM_API_KEY=your-api-key-here",
          "INKOS_LLM_MODEL=gpt-4o",
          "",
          "# Optional parameters (defaults shown):",
          "# INKOS_LLM_TEMPERATURE=0.7",
          "# INKOS_LLM_MAX_TOKENS=8192",
          "# INKOS_LLM_THINKING_BUDGET=0          # Anthropic extended thinking budget",
          "# INKOS_LLM_API_FORMAT=chat             # chat (default) or responses (OpenAI Responses API)",
          "",
          "# Anthropic example:",
          "# INKOS_LLM_PROVIDER=anthropic",
          "# INKOS_LLM_BASE_URL=https://api.anthropic.com",
          "# INKOS_LLM_MODEL=claude-sonnet-4-5-20250514",
        ].join("\n"),
        "utf-8",
      );

      await writeFile(
        join(projectDir, ".gitignore"),
        [".env", "node_modules/", ".DS_Store"].join("\n"),
        "utf-8",
      );

      log(`Project initialized at ${projectDir}`);
      log("");
      log("Next steps:");
      log(`  cd ${name}`);
      log("  # Edit .env with your LLM API credentials");
      log("  inkos book create --title '我的小说' --genre xuanhuan --platform tomato");
      log("  inkos write next <book-id>");
    } catch (e) {
      logError(`Failed to initialize project: ${e}`);
      process.exit(1);
    }
  });
