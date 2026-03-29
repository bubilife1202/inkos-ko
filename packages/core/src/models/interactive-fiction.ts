import { z } from "zod";

export const InteractiveSnapshotRefSchema = z.object({
  chapterNumber: z.number().int().min(0),
});
export type InteractiveSnapshotRef = z.infer<typeof InteractiveSnapshotRefSchema>;

export const InteractiveBranchNodeStatusSchema = z.enum([
  "active",
  "awaiting-choice",
  "dormant",
  "completed",
]);
export type InteractiveBranchNodeStatus = z.infer<typeof InteractiveBranchNodeStatusSchema>;

export const InteractiveBranchNodeSchema = z.object({
  nodeId: z.string().min(1),
  parentNodeId: z.string().min(1).nullable(),
  sourceChapterId: z.string().min(1).nullable(),
  sourceChapterNumber: z.number().int().min(0),
  branchDepth: z.number().int().min(0),
  branchLabel: z.string().min(1),
  status: InteractiveBranchNodeStatusSchema,
  snapshotRef: InteractiveSnapshotRefSchema,
  selectedChoiceId: z.string().min(1).nullable(),
  chapterIds: z.array(z.string().min(1)).default([]),
  displayPath: z.string().min(1),
});
export type InteractiveBranchNode = z.infer<typeof InteractiveBranchNodeSchema>;

export const InteractiveChoiceSchema = z.object({
  choiceId: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  label: z.string().min(1),
  intent: z.string().min(1),
  immediateGoal: z.string().min(1),
  expectedCost: z.string().min(1),
  expectedRisk: z.string().min(1),
  hookPressure: z.string().min(1),
  characterPressure: z.string().min(1),
  tone: z.string().min(1),
  selected: z.boolean(),
});
export type InteractiveChoice = z.infer<typeof InteractiveChoiceSchema>;

export const InteractiveBranchTreeSchema = z.object({
  version: z.literal(1),
  activeNodeId: z.string().min(1),
  rootNodeId: z.string().min(1),
  nodes: z.array(InteractiveBranchNodeSchema).min(1),
  choices: z.array(InteractiveChoiceSchema).default([]),
});
export type InteractiveBranchTree = z.infer<typeof InteractiveBranchTreeSchema>;
