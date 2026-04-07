import { BaseAgent } from "./base.js";
import type { ArchitectOutput } from "./architect.js";

export interface FoundationReviewResult {
  readonly passed: boolean;
  readonly totalScore: number;
  readonly dimensions: ReadonlyArray<{
    readonly name: string;
    readonly score: number;
    readonly feedback: string;
  }>;
  readonly overallFeedback: string;
}

const PASS_THRESHOLD = 80;
const DIMENSION_FLOOR = 60;

export class FoundationReviewerAgent extends BaseAgent {
  get name(): string {
    return "foundation-reviewer";
  }

  async review(params: {
    readonly foundation: ArchitectOutput;
    readonly mode: "original" | "fanfic" | "series";
    readonly sourceCanon?: string;
    readonly styleGuide?: string;
    readonly language: "zh" | "en" | "ko";
  }): Promise<FoundationReviewResult> {
    const isKorean = params.language === "ko";
    const canonBlock = params.sourceCanon
      ? `\n## ${isKorean ? "원작 원전 참조" : "原作正典参照"}\n${params.sourceCanon.slice(0, 8000)}\n`
      : "";
    const styleBlock = params.styleGuide
      ? `\n## ${isKorean ? "원작 문체 참조" : "原作风格参照"}\n${params.styleGuide.slice(0, 2000)}\n`
      : "";

    const dimensions = params.mode === "original"
      ? this.originalDimensions(params.language)
      : this.derivativeDimensions(params.language, params.mode);

    const systemPrompt = params.language === "en"
      ? this.buildEnglishReviewPrompt(dimensions, canonBlock, styleBlock)
      : params.language === "ko"
        ? this.buildKoreanReviewPrompt(dimensions, canonBlock, styleBlock)
        : this.buildChineseReviewPrompt(dimensions, canonBlock, styleBlock);

    const userPrompt = this.buildFoundationExcerpt(params.foundation, params.language);

    const response = await this.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { maxTokens: 4096, temperature: 0.3 });

    return this.parseReviewResult(response.content, dimensions);
  }

  private originalDimensions(language: "zh" | "en" | "ko"): ReadonlyArray<string> {
    if (language === "en") {
      return [
        "Core Conflict (Is there a clear, compelling central conflict that can sustain 40 chapters?)",
        "Opening Momentum (Can the first 5 chapters create a page-turning hook?)",
        "World Coherence (Is the worldbuilding internally consistent and specific?)",
        "Character Differentiation (Are the main characters distinct in voice and motivation?)",
        "Pacing Feasibility (Does the volume outline have enough variety — not the same beat for 10 chapters?)",
      ];
    }
    if (language === "ko") {
      return [
        "핵심 갈등 (40화를 지탱할 수 있는 명확하고 긴장감 있는 중심 갈등이 있는가?)",
        "초반 모멘텀 (첫 5화가 다음 화 넘김을 유도하는 훅을 만들 수 있는가?)",
        "세계관 일관성 (세계 설정이 내적으로 모순 없이 구체적인가?)",
        "인물 차별성 (주요 인물의 목소리와 동기가 서로 뚜렷이 구분되는가?)",
        "페이싱 실현 가능성 (볼륨 아웃라인에 충분한 변화가 있는가 — 10화 연속 같은 리듬 아닌가?)",
      ];
    }
    return [
      "核心冲突（是否有清晰且有足够张力的核心冲突支撑40章？）",
      "开篇节奏（前5章能否形成翻页驱动力？）",
      "世界一致性（世界观是否内洽且具体？）",
      "角色区分度（主要角色的声音和动机是否各不相同？）",
      "节奏可行性（卷纲是否有足够变化——不会连续10章同一种节拍？）",
    ];
  }

  private derivativeDimensions(language: "zh" | "en" | "ko", mode: "fanfic" | "series"): ReadonlyArray<string> {
    const modeLabel = mode === "fanfic"
      ? (language === "en" ? "Fan Fiction" : language === "ko" ? "2차 창작" : "同人")
      : (language === "en" ? "Series" : language === "ko" ? "시리즈" : "系列");

    if (language === "en") {
      return [
        `Source DNA Preservation (Does the ${modeLabel} respect the original's world rules, character personalities, and established facts?)`,
        `New Narrative Space (Is there a clear divergence point or new territory that gives the story room to be ORIGINAL, not a retelling?)`,
        "Core Conflict (Is the new story's central conflict compelling and distinct from the original?)",
        "Opening Momentum (Can the first 5 chapters create a page-turning hook without requiring 3 chapters of setup?)",
        `Pacing Feasibility (Does the outline avoid the trap of re-walking the original's plot beats?)`,
      ];
    }
    if (language === "ko") {
      return [
        `원작 DNA 보존 (${modeLabel}이 원작의 세계 규칙, 캐릭터 성격, 확립된 사실을 존중하는가?)`,
        `새로운 서사 공간 (명확한 분기점이나 새 영역이 있어 원작 재서술이 아닌 독자적 이야기 공간이 확보되는가?)`,
        "핵심 갈등 (새 이야기의 중심 갈등이 원작과 차별화되면서 충분한 긴장감을 갖는가?)",
        "초반 모멘텀 (첫 5화가 3화 분량의 도입부 없이 페이지 넘김 훅을 만들 수 있는가?)",
        `페이싱 실현 가능성 (아웃라인이 원작의 스토리 비트를 그대로 답습하는 함정을 피하는가?)`,
      ];
    }
    return [
      `原作DNA保留（${modeLabel}是否尊重原作的世界规则、角色性格、已确立事实？）`,
      `新叙事空间（是否有明确的分岔点或新领域，让故事有原创空间，而非复述原作？）`,
      "核心冲突（新故事的核心冲突是否有足够张力且区别于原作？）",
      "开篇节奏（前5章能否形成翻页驱动力，不需要3章铺垫？）",
      `节奏可行性（卷纲是否避免了重走原作剧情节拍的陷阱？）`,
    ];
  }

  private buildChineseReviewPrompt(
    dimensions: ReadonlyArray<string>,
    canonBlock: string,
    styleBlock: string,
  ): string {
    return `你是一位资深小说编辑，正在审核一本新书的基础设定（世界观 + 大纲 + 规则）。

你需要从以下维度逐项打分（0-100），并给出具体意见：

${dimensions.map((dim, i) => `${i + 1}. ${dim}`).join("\n")}

## 评分标准
- 80+ 通过，可以开始写作
- 60-79 有明显问题，需要修改
- <60 方向性错误，需要重新设计

## 输出格式（严格遵守）
=== DIMENSION: 1 ===
分数：{0-100}
意见：{具体反馈}

=== DIMENSION: 2 ===
分数：{0-100}
意见：{具体反馈}

...（每个维度一个 block）

=== OVERALL ===
总分：{加权平均}
通过：{是/否}
总评：{1-2段总结，指出最大的问题和最值得保留的优点}
${canonBlock}${styleBlock}

审核时要严格。不要因为"还行"就给高分。80分意味着"可以直接开写，不需要改"。`;
  }

  private buildKoreanReviewPrompt(
    dimensions: ReadonlyArray<string>,
    canonBlock: string,
    styleBlock: string,
  ): string {
    return `당신은 시니어 소설 편집자로서, 새 작품의 기초 설정(세계관 + 아웃라인 + 규칙)을 심사하고 있습니다.

다음 차원별로 점수(0-100)를 매기고, 구체적인 의견을 제시하세요:

${dimensions.map((dim, i) => `${i + 1}. ${dim}`).join("\n")}

## 평가 기준
- 80+ 통과, 집필 시작 가능
- 60-79 뚜렷한 문제가 있어 수정 필요
- <60 방향 자체가 잘못됨, 재설계 필요

## 한국 웹소설 특수 점검 항목
- 존댓말/반말 체계가 인물 관계에 맞게 설계되어 있는가
- 짧은 문단(1-2문장) 리듬이 고려되어 있는가
- 클리프행어 기법이 회차 구조에 반영되어 있는가
- "~했다" 종결어미 반복 지양이 가이드에 포함되어 있는가
- 형/누나/오빠/언니·선배/후배 등 한국식 호칭 체계가 자연스러운가

## 출력 형식 (엄격히 준수)
=== DIMENSION: 1 ===
점수: {0-100}
의견: {구체적 피드백}

=== DIMENSION: 2 ===
점수: {0-100}
의견: {구체적 피드백}

...(각 차원별 1개 블록)

=== OVERALL ===
총점: {가중 평균}
통과: {예/아니오}
총평: {1-2단락 요약 — 가장 큰 문제점과 가장 보존할 만한 장점 제시}
${canonBlock}${styleBlock}

심사는 엄격하게 하세요. "괜찮다"는 이유로 높은 점수를 주지 마세요. 80점은 "수정 없이 바로 집필 가능"을 의미합니다.`;
  }

  private buildEnglishReviewPrompt(
    dimensions: ReadonlyArray<string>,
    canonBlock: string,
    styleBlock: string,
  ): string {
    return `You are a senior fiction editor reviewing a new book's foundation (worldbuilding + outline + rules).

Score each dimension (0-100) with specific feedback:

${dimensions.map((dim, i) => `${i + 1}. ${dim}`).join("\n")}

## Scoring
- 80+ Pass — ready to write
- 60-79 Needs revision
- <60 Fundamental direction problem

## Output format (strict)
=== DIMENSION: 1 ===
Score: {0-100}
Feedback: {specific feedback}

=== DIMENSION: 2 ===
Score: {0-100}
Feedback: {specific feedback}

...

=== OVERALL ===
Total: {weighted average}
Passed: {yes/no}
Summary: {1-2 paragraphs — biggest problem and best quality}
${canonBlock}${styleBlock}

Be strict. 80 means "ready to write without changes."`;
  }

  private buildFoundationExcerpt(foundation: ArchitectOutput, language: "zh" | "en" | "ko"): string {
    if (language === "en") {
      return `## Story Bible\n${foundation.storyBible.slice(0, 3000)}\n\n## Volume Outline\n${foundation.volumeOutline.slice(0, 3000)}\n\n## Book Rules\n${foundation.bookRules.slice(0, 1500)}\n\n## Initial State\n${foundation.currentState.slice(0, 1000)}\n\n## Initial Hooks\n${foundation.pendingHooks.slice(0, 1000)}`;
    }
    if (language === "ko") {
      return `## 세계관 설정\n${foundation.storyBible.slice(0, 3000)}\n\n## 볼륨 아웃라인\n${foundation.volumeOutline.slice(0, 3000)}\n\n## 규칙\n${foundation.bookRules.slice(0, 1500)}\n\n## 초기 상태\n${foundation.currentState.slice(0, 1000)}\n\n## 초기 복선\n${foundation.pendingHooks.slice(0, 1000)}`;
    }
    return `## 世界设定\n${foundation.storyBible.slice(0, 3000)}\n\n## 卷纲\n${foundation.volumeOutline.slice(0, 3000)}\n\n## 规则\n${foundation.bookRules.slice(0, 1500)}\n\n## 初始状态\n${foundation.currentState.slice(0, 1000)}\n\n## 初始伏笔\n${foundation.pendingHooks.slice(0, 1000)}`;
  }

  private parseReviewResult(
    content: string,
    dimensions: ReadonlyArray<string>,
  ): FoundationReviewResult {
    const parsedDimensions: Array<{ readonly name: string; readonly score: number; readonly feedback: string }> = [];

    for (let i = 0; i < dimensions.length; i++) {
      const regex = new RegExp(
        `=== DIMENSION: ${i + 1} ===\\s*[\\s\\S]*?(?:分数|Score|점수)[：:]\\s*(\\d+)[\\s\\S]*?(?:意见|Feedback|의견)[：:]\\s*([\\s\\S]*?)(?==== |$)`,
      );
      const match = content.match(regex);
      parsedDimensions.push({
        name: dimensions[i]!,
        score: match ? parseInt(match[1]!, 10) : 50,
        feedback: match ? match[2]!.trim() : "(parse failed)",
      });
    }

    const totalScore = parsedDimensions.length > 0
      ? Math.round(parsedDimensions.reduce((sum, d) => sum + d.score, 0) / parsedDimensions.length)
      : 0;
    const anyBelowFloor = parsedDimensions.some((d) => d.score < DIMENSION_FLOOR);
    const passed = totalScore >= PASS_THRESHOLD && !anyBelowFloor;

    const overallMatch = content.match(
      /=== OVERALL ===[\s\S]*?(?:总评|Summary|총평)[：:]\s*([\s\S]*?)$/,
    );
    const overallFeedback = overallMatch ? overallMatch[1]!.trim() : "(parse failed)";

    return { passed, totalScore, dimensions: parsedDimensions, overallFeedback };
  }
}
