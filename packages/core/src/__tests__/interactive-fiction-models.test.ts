import { describe, expect, it } from "vitest";
import { InteractiveBranchTreeSchema } from "../models/interactive-fiction.js";

describe("InteractiveBranchTreeSchema", () => {
  it("accepts a minimal branch tree with a root node and active pointer", () => {
    const tree = InteractiveBranchTreeSchema.parse({
      version: 1,
      activeNodeId: "root",
      rootNodeId: "root",
      nodes: [
        {
          nodeId: "root",
          parentNodeId: null,
          sourceChapterId: null,
          sourceChapterNumber: 0,
          branchDepth: 0,
          branchLabel: "Main Route",
          status: "active",
          snapshotRef: {
            chapterNumber: 0,
          },
          selectedChoiceId: null,
          chapterIds: [],
          displayPath: "main",
        },
      ],
      choices: [],
    });

    expect(tree.activeNodeId).toBe("root");
    expect(tree.rootNodeId).toBe("root");
    expect(tree.nodes).toHaveLength(1);
  });

  it("accepts child choices that point to dormant branch nodes sharing a snapshot", () => {
    const tree = InteractiveBranchTreeSchema.parse({
      version: 1,
      activeNodeId: "root",
      rootNodeId: "root",
      nodes: [
        {
          nodeId: "root",
          parentNodeId: null,
          sourceChapterId: null,
          sourceChapterNumber: 0,
          branchDepth: 0,
          branchLabel: "Main Route",
          status: "awaiting-choice",
          snapshotRef: {
            chapterNumber: 12,
          },
          selectedChoiceId: null,
          chapterIds: ["ch-0012"],
          displayPath: "main",
        },
        {
          nodeId: "n-a",
          parentNodeId: "root",
          sourceChapterId: "ch-0012",
          sourceChapterNumber: 12,
          branchDepth: 1,
          branchLabel: "Take the deal",
          status: "dormant",
          snapshotRef: {
            chapterNumber: 12,
          },
          selectedChoiceId: null,
          chapterIds: [],
          displayPath: "main.a",
        },
      ],
      choices: [
        {
          choiceId: "c-a",
          fromNodeId: "root",
          toNodeId: "n-a",
          label: "Take the deal",
          intent: "Accept the deal and enter the archive under watch.",
          immediateGoal: "Get inside without losing leverage.",
          expectedCost: "Owe a favor immediately.",
          expectedRisk: "Hidden surveillance and debt.",
          hookPressure: "Anonymous patron hook advances.",
          characterPressure: "Trust between allies strains.",
          tone: "tense",
          selected: false,
        },
      ],
    });

    expect(tree.nodes[1]?.snapshotRef.chapterNumber).toBe(12);
    expect(tree.choices[0]?.toNodeId).toBe("n-a");
  });

  it("rejects invalid branch node status", () => {
    expect(() => InteractiveBranchTreeSchema.parse({
      version: 1,
      activeNodeId: "root",
      rootNodeId: "root",
      nodes: [
        {
          nodeId: "root",
          parentNodeId: null,
          sourceChapterId: null,
          sourceChapterNumber: 0,
          branchDepth: 0,
          branchLabel: "Main Route",
          status: "queued",
          snapshotRef: {
            chapterNumber: 0,
          },
          selectedChoiceId: null,
          chapterIds: [],
          displayPath: "main",
        },
      ],
      choices: [],
    })).toThrow();
  });
});
