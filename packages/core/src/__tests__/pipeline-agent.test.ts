import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_TOOLS, executeAgentTool } from "../pipeline/agent.js";
import { PipelineRunner, StateManager, type PipelineConfig } from "../index.js";

describe("agent pipeline tools", () => {
  let root: string;
  let state: StateManager;
  let pipeline: PipelineRunner;
  let config: PipelineConfig;
  let bookId: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-agent-tools-"));
    state = new StateManager(root);
    bookId = "agent-book";

    config = {
      client: {
        provider: "openai",
        apiFormat: "chat",
        stream: false,
        defaults: {
          temperature: 0.7,
          maxTokens: 4096,
          thinkingBudget: 0, maxTokensCap: null,
          extra: {},
        },
      },
      model: "test-model",
      projectRoot: root,
      inputGovernanceMode: "v2",
    };

    pipeline = new PipelineRunner(config);

    await state.saveBookConfig(bookId, {
      id: bookId,
      title: "Agent Book",
      platform: "tomato",
      genre: "other",
      status: "active",
      targetChapters: 20,
      chapterWordCount: 3000,
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    });

    const storyDir = join(state.bookDir(bookId), "story");
    await mkdir(join(storyDir, "runtime"), { recursive: true });
    await mkdir(join(state.bookDir(bookId), "chapters"), { recursive: true });
    await writeFile(join(state.bookDir(bookId), "chapters", "index.json"), "[]", "utf-8");

    await Promise.all([
      writeFile(join(storyDir, "author_intent.md"), "# Author Intent\n\nKeep the story centered on the mentor conflict.\n", "utf-8"),
      writeFile(join(storyDir, "current_focus.md"), "# Current Focus\n\nBring focus back to the mentor conflict.\n", "utf-8"),
      writeFile(join(storyDir, "story_bible.md"), "# Story Bible\n\n- The jade seal cannot be destroyed.\n", "utf-8"),
      writeFile(join(storyDir, "volume_outline.md"), "# Volume Outline\n\n## Chapter 1\nTrack the merchant guild trail.\n", "utf-8"),
      writeFile(join(storyDir, "book_rules.md"), "---\nprohibitions:\n  - Do not reveal the mastermind\n---\n\n# Book Rules\n", "utf-8"),
      writeFile(join(storyDir, "current_state.md"), "# Current State\n\n- Lin Yue still hides the broken oath token.\n", "utf-8"),
      writeFile(join(storyDir, "pending_hooks.md"), "# Pending Hooks\n\n- Why the mentor vanished after the trial.\n", "utf-8"),
    ]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("registers the input governance tools", () => {
    const toolNames = AGENT_TOOLS.map((tool) => tool.name);

    expect(toolNames).toContain("plan_chapter");
    expect(toolNames).toContain("compose_chapter");
    expect(toolNames).toContain("update_author_intent");
    expect(toolNames).toContain("update_current_focus");
    expect(toolNames).toContain("get_branch_tree");
    expect(toolNames).toContain("get_branch_choices");
    expect(toolNames).toContain("choose_branch");
    expect(toolNames).toContain("switch_branch");
  });

  it("exposes interactive branch tools through the agent tool surface", async () => {
    const branchTree = {
      version: 1 as const,
      rootNodeId: "root",
      activeNodeId: "root",
      nodes: [
        {
          nodeId: "root",
          parentNodeId: null,
          sourceChapterId: null,
          sourceChapterNumber: 0,
          branchDepth: 0,
          branchLabel: "Main Route",
          status: "awaiting-choice" as const,
          snapshotRef: { chapterNumber: 1 },
          selectedChoiceId: null,
          chapterIds: ["ch-0001"],
          displayPath: "main",
        },
      ],
      choices: [
        {
          choiceId: "choice-root-a",
          fromNodeId: "root",
          toNodeId: "node-a",
          label: "Route A",
          intent: "Take route A.",
          immediateGoal: "Advance route A.",
          expectedCost: "Lose route B.",
          expectedRisk: "Conflict rises.",
          hookPressure: "A hook advances.",
          characterPressure: "A pressure rises.",
          tone: "tense",
          selected: false,
        },
      ],
    };

    vi.spyOn(pipeline, "getInteractiveBranchTree").mockResolvedValue(branchTree);
    vi.spyOn(pipeline, "listInteractiveChoices").mockResolvedValue({
      bookId,
      activeNodeId: "root",
      activeNodeStatus: "awaiting-choice",
      choices: branchTree.choices,
    });
    vi.spyOn(pipeline, "chooseInteractiveBranch").mockResolvedValue({
      bookId,
      activeNodeId: "node-a",
      restoredChapter: 1,
      selectedChoiceId: "choice-root-a",
    });
    vi.spyOn(pipeline, "switchInteractiveBranch").mockResolvedValue({
      bookId,
      activeNodeId: "node-b",
      restoredChapter: 1,
    });

    await expect(
      executeAgentTool(pipeline, state, config, "get_branch_tree", { bookId }),
    ).resolves.toBe(JSON.stringify(branchTree));

    await expect(
      executeAgentTool(pipeline, state, config, "get_branch_choices", { bookId }),
    ).resolves.toBe(JSON.stringify({
      bookId,
      activeNodeId: "root",
      activeNodeStatus: "awaiting-choice",
      choices: branchTree.choices,
    }));

    await expect(
      executeAgentTool(pipeline, state, config, "choose_branch", {
        bookId,
        choiceId: "choice-root-a",
      }),
    ).resolves.toBe(JSON.stringify({
      bookId,
      activeNodeId: "node-a",
      restoredChapter: 1,
      selectedChoiceId: "choice-root-a",
    }));

    await expect(
      executeAgentTool(pipeline, state, config, "switch_branch", {
        bookId,
        nodeId: "node-b",
      }),
    ).resolves.toBe(JSON.stringify({
      bookId,
      activeNodeId: "node-b",
      restoredChapter: 1,
    }));
  });

  it("returns active-branch scoped status for interactive books", async () => {
    const baseBook = await state.loadBookConfig(bookId);
    await state.saveBookConfig(bookId, {
      ...baseBook,
      narrativeMode: "interactive-tree",
    });
    await state.saveChapterIndex(bookId, [
      {
        number: 1,
        title: "Seed",
        status: "approved",
        wordCount: 100,
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
        auditIssues: [],
        lengthWarnings: [],
      },
      {
        number: 2,
        title: "Route A",
        status: "ready-for-review",
        wordCount: 120,
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
        auditIssues: [],
        lengthWarnings: [],
      },
      {
        number: 3,
        title: "Route B",
        status: "ready-for-review",
        wordCount: 140,
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
        auditIssues: [],
        lengthWarnings: [],
      },
    ]);
    await state.saveBranchTree(bookId, {
      version: 1,
      rootNodeId: "root",
      activeNodeId: "node-a",
      nodes: [
        {
          nodeId: "root",
          parentNodeId: null,
          sourceChapterId: null,
          sourceChapterNumber: 0,
          branchDepth: 0,
          branchLabel: "Main Route",
          status: "completed",
          snapshotRef: { chapterNumber: 1 },
          selectedChoiceId: "choice-root-a",
          chapterIds: ["ch-0001"],
          displayPath: "main",
        },
        {
          nodeId: "node-a",
          parentNodeId: "root",
          sourceChapterId: "ch-0001",
          sourceChapterNumber: 1,
          branchDepth: 1,
          branchLabel: "Route A",
          status: "active",
          snapshotRef: { chapterNumber: 2 },
          selectedChoiceId: null,
          chapterIds: ["ch-0002"],
          displayPath: "main.a",
        },
        {
          nodeId: "node-b",
          parentNodeId: "root",
          sourceChapterId: "ch-0001",
          sourceChapterNumber: 1,
          branchDepth: 1,
          branchLabel: "Route B",
          status: "dormant",
          snapshotRef: { chapterNumber: 1 },
          selectedChoiceId: null,
          chapterIds: ["ch-0003"],
          displayPath: "main.b",
        },
      ],
      choices: [
        {
          choiceId: "choice-root-a",
          fromNodeId: "root",
          toNodeId: "node-a",
          label: "Route A",
          intent: "Take route A.",
          immediateGoal: "Advance route A.",
          expectedCost: "Lose route B.",
          expectedRisk: "Conflict rises.",
          hookPressure: "A hook advances.",
          characterPressure: "A pressure rises.",
          tone: "tense",
          selected: true,
        },
      ],
    });

    const result = JSON.parse(await executeAgentTool(
      pipeline,
      state,
      config,
      "get_book_status",
      { bookId },
    ));

    expect(result.chaptersWritten).toBe(2);
    expect(result.totalWords).toBe(220);
    expect(result.chapters.map((chapter: { number: number }) => chapter.number)).toEqual([1, 2]);
    expect(result.activeBranch).toEqual({
      activeNodeId: "node-a",
      displayPath: "main.a",
      status: "active",
      visibleChapterNumbers: [1, 2],
      pendingChoiceCount: 0,
    });
  });

  it("plans and composes chapters through the agent tool surface", async () => {
    const planResult = JSON.parse(await executeAgentTool(
      pipeline,
      state,
      config,
      "plan_chapter",
      { bookId, guidance: "Ignore the guild chase and focus on the mentor conflict." },
    ));

    expect(planResult.intentPath).toBe("story/runtime/chapter-0001.intent.md");

    const composeResult = JSON.parse(await executeAgentTool(
      pipeline,
      state,
      config,
      "compose_chapter",
      { bookId, guidance: "Ignore the guild chase and focus on the mentor conflict." },
    ));

    expect(composeResult.contextPath).toBe("story/runtime/chapter-0001.context.json");
    expect(composeResult.ruleStackPath).toBe("story/runtime/chapter-0001.rule-stack.yaml");
    expect(composeResult.tracePath).toBe("story/runtime/chapter-0001.trace.json");
  });

  it("updates author_intent.md and current_focus.md through dedicated tools", async () => {
    await executeAgentTool(pipeline, state, config, "update_author_intent", {
      bookId,
      content: "# Author Intent\n\nMake this a colder revenge story.\n",
    });
    await executeAgentTool(pipeline, state, config, "update_current_focus", {
      bookId,
      content: "# Current Focus\n\nSpend the next two chapters on mentor fallout.\n",
    });

    await expect(readFile(join(state.bookDir(bookId), "story", "author_intent.md"), "utf-8"))
      .resolves.toContain("colder revenge story");
    await expect(readFile(join(state.bookDir(bookId), "story", "current_focus.md"), "utf-8"))
      .resolves.toContain("mentor fallout");
  });

  it("blocks write_full_pipeline when runtime progress is ahead of the chapter index", async () => {
    const stateDir = join(state.bookDir(bookId), "story", "state");
    await mkdir(stateDir, { recursive: true });
    await state.saveChapterIndex(bookId, [{
      number: 1,
      title: "Existing Chapter",
      status: "approved",
      wordCount: 120,
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
      auditIssues: [],
      lengthWarnings: [],
    }]);
    await writeFile(join(stateDir, "manifest.json"), JSON.stringify({
      schemaVersion: 2,
      language: "zh",
      lastAppliedChapter: 3,
      projectionVersion: 1,
      migrationWarnings: [],
    }, null, 2), "utf-8");
    await writeFile(join(stateDir, "current_state.json"), JSON.stringify({
      chapter: 3,
      facts: [],
    }, null, 2), "utf-8");

    const writeNextChapter = vi.spyOn(pipeline, "writeNextChapter").mockResolvedValue({
      bookId,
      chapterNumber: 4,
      title: "Should Not Run",
      wordCount: 100,
      filePath: "books/agent-book/chapters/0004_Should_Not_Run.md",
      auditResult: { passed: true, issues: [], summary: "ok" },
      revised: false,
      status: "ready-for-review",
    } as Awaited<ReturnType<typeof pipeline.writeNextChapter>>);

    const result = JSON.parse(await executeAgentTool(
      pipeline,
      state,
      config,
      "write_full_pipeline",
      { bookId, count: 1 },
    ));

    expect(result.error).toContain("write_full_pipeline");
    expect(writeNextChapter).not.toHaveBeenCalled();
  });

  it("blocks write_truth_file from hacking chapter progress inside current_state.md", async () => {
    const result = JSON.parse(await executeAgentTool(
      pipeline,
      state,
      config,
      "write_truth_file",
      {
        bookId,
        fileName: "current_state.md",
        content: "# Current State\n\n| Current Chapter | 999 |\n",
      },
    ));

    expect(result.error).toContain("章节进度");
  });

  it("blocks write_draft when an interactive branch is waiting for a reader choice", async () => {
    const baseBook = await state.loadBookConfig(bookId);
    await state.saveBookConfig(bookId, {
      ...baseBook,
      narrativeMode: "interactive-tree",
    });
    const tree = await state.ensureInteractiveTree(bookId);
    await state.saveBranchTree(bookId, {
      ...tree,
      nodes: [
        {
          ...tree.nodes[0]!,
          status: "awaiting-choice",
          snapshotRef: { chapterNumber: 1 },
          chapterIds: ["ch-0001"],
        },
      ],
      choices: [
        {
          choiceId: "choice-root-1-1",
          fromNodeId: "root",
          toNodeId: "root-1-a",
          label: "接受交易",
          intent: "接受交易，先进入档案室。",
          immediateGoal: "今晚进入档案室。",
          expectedCost: "欠下一笔人情。",
          expectedRisk: "后续会被监视。",
          hookPressure: "看守线推进。",
          characterPressure: "同伴信任下降。",
          tone: "紧张",
          selected: false,
        },
      ],
    });

    const writeDraft = vi.spyOn(pipeline, "writeDraft").mockResolvedValue({
      chapterNumber: 2,
      title: "Should Not Run",
      wordCount: 100,
      filePath: "books/agent-book/chapters/0002_Should_Not_Run.md",
    });

    const result = JSON.parse(await executeAgentTool(
      pipeline,
      state,
      config,
      "write_draft",
      { bookId },
    ));

    expect(result.error).toMatch(/分支|选项|choice/i);
    expect(writeDraft).not.toHaveBeenCalled();
  });

  it("blocks write_full_pipeline when an interactive branch is waiting for a reader choice", async () => {
    const baseBook = await state.loadBookConfig(bookId);
    await state.saveBookConfig(bookId, {
      ...baseBook,
      narrativeMode: "interactive-tree",
    });
    const tree = await state.ensureInteractiveTree(bookId);
    await state.saveBranchTree(bookId, {
      ...tree,
      nodes: [
        {
          ...tree.nodes[0]!,
          status: "awaiting-choice",
          snapshotRef: { chapterNumber: 1 },
          chapterIds: ["ch-0001"],
        },
      ],
      choices: [
        {
          choiceId: "choice-root-1-1",
          fromNodeId: "root",
          toNodeId: "root-1-a",
          label: "接受交易",
          intent: "接受交易，先进入档案室。",
          immediateGoal: "今晚进入档案室。",
          expectedCost: "欠下一笔人情。",
          expectedRisk: "后续会被监视。",
          hookPressure: "看守线推进。",
          characterPressure: "同伴信任下降。",
          tone: "紧张",
          selected: false,
        },
      ],
    });

    const writeNextChapter = vi.spyOn(pipeline, "writeNextChapter").mockResolvedValue({
      chapterNumber: 2,
      title: "Should Not Run",
      wordCount: 100,
      auditResult: { passed: true, issues: [], summary: "ok" },
      revised: false,
      status: "ready-for-review",
    });

    const result = JSON.parse(await executeAgentTool(
      pipeline,
      state,
      config,
      "write_full_pipeline",
      { bookId, count: 1 },
    ));

    expect(result.error).toMatch(/分支|选项|choice/i);
    expect(writeNextChapter).not.toHaveBeenCalled();
  });
});
