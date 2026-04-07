import { BaseAgent } from "./base.js";
import type { GenreProfile } from "../models/genre-profile.js";
import type { BookRules } from "../models/book-rules.js";
import type { LengthSpec } from "../models/length-governance.js";
import type { AuditIssue } from "./continuity.js";
import type { ContextPackage, RuleStack } from "../models/input-governance.js";
import { readGenreProfile, readBookLanguage, readBookRules } from "./rules-reader.js";
import { countChapterLength } from "../utils/length-metrics.js";
import { buildGovernedMemoryEvidenceBlocks } from "../utils/governed-context.js";
import { filterSummaries } from "../utils/context-filter.js";
import {
  buildGovernedCharacterMatrixWorkingSet,
  buildGovernedHookWorkingSet,
  mergeTableMarkdownByKey,
} from "../utils/governed-working-set.js";
import { applySpotFixPatches, parseSpotFixPatches } from "../utils/spot-fix-patches.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ReviseMode = "polish" | "rewrite" | "rework" | "anti-detect" | "spot-fix";

export const DEFAULT_REVISE_MODE: ReviseMode = "spot-fix";

export interface ReviseOutput {
  readonly revisedContent: string;
  readonly wordCount: number;
  readonly fixedIssues: ReadonlyArray<string>;
  readonly updatedState: string;
  readonly updatedLedger: string;
  readonly updatedHooks: string;
  readonly tokenUsage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

const MODE_DESCRIPTIONS: Record<ReviseMode, string> = {
  polish: "润色：只改表达、节奏、段落呼吸，不改事实与剧情结论。禁止：增删段落、改变人名/地名/物品名、增加新情节或新对话、改变因果关系。只允许：替换用词、调整句序、修改标点节奏",
  rewrite: "改写：允许重组问题段落、调整画面和叙述力度，但优先保留原文的绝大部分句段。除非问题跨越整章，否则禁止整章推倒重写；只能围绕问题段落及其直接上下文改写，同时保留核心事实与人物动机",
  rework: "重写：可重构场景推进和冲突组织，但不改主设定和大事件结果",
  "anti-detect": `反检测改写：在保持剧情不变的前提下，降低AI生成可检测性。

改写手法（附正例）：
1. 打破句式规律：连续短句 → 长短交替，句式不可预测
2. 口语化替代：✗"然而事情并没有那么简单" → ✓"哪有那么便宜的事"
3. 减少"了"字密度：✗"他走了过去，拿了杯子" → ✓"他走过去，端起杯子"
4. 转折词降频：✗"虽然…但是…" → ✓ 用角色内心吐槽或直接动作切换
5. 情绪外化：✗"他感到愤怒" → ✓"他捏碎了茶杯，滚烫的茶水流过指缝"
6. 删掉叙述者结论：✗"这一刻他终于明白了力量" → ✓ 只写行动，让读者自己感受
7. 群像反应具体化：✗"全场震惊" → ✓"老陈的烟掉在裤子上，烫得他跳起来"
8. 段落长度差异化：不再等长段落，有的段只有一句话，有的段七八行
9. 消灭"不禁""仿佛""宛如"等AI标记词：换成具体感官描写`,
  "spot-fix": "定点修复：只修改审稿意见指出的具体句子或段落，其余所有内容必须原封不动保留。修改范围限定在问题句子及其前后各一句。禁止改动无关段落",
};

const MODE_DESCRIPTIONS_KO: Record<ReviseMode, string> = {
  polish: "윤문: 표현·리듬·문단 호흡만 다듬고, 사실과 스토리 결론은 변경하지 않습니다. 금지: 문단 추가/삭제, 인명/지명/아이템명 변경, 새 에피소드나 대화 추가, 인과관계 변경. 허용: 어휘 교체, 문장 순서 조정, 문장부호 리듬 수정",
  rewrite: "개작: 문제 문단 재구성·화면과 서술 강도 조정을 허용하되, 원문의 대부분을 우선 보존합니다. 문제가 회차 전체에 걸치지 않는 한 전면 재작성 금지. 문제 문단과 그 직접 전후 맥락만 개작하며 핵심 사실과 인물 동기는 유지하세요",
  rework: "재구성: 장면 진행과 갈등 구조를 재설계할 수 있으나, 핵심 설정과 대사건 결과는 변경하지 않습니다",
  "anti-detect": `AI 탐지 우회 개작: 스토리를 유지하면서 AI 생성 탐지 가능성을 낮춥니다.

개작 기법 (모범 사례 포함):
1. 문형 규칙 깨기: 연속 단문 → 장단 교차, 문형을 예측 불가능하게
2. 구어체 대체: ✗"그러나 상황은 그리 간단하지 않았다" → ✓"그렇게 쉬울 리가 있나"
3. "~했다" 반복 지양: ✗"그는 걸어갔다. 그리고 잔을 들었다" → ✓"걸음을 옮기더니 잔을 낚아챘다"
4. 접속부사 빈도 줄이기: ✗"비록~이지만" → ✓ 인물 속마음 독백이나 직접 행동 전환으로 처리
5. 감정 외현화: ✗"그는 분노를 느꼈다" → ✓"찻잔이 손안에서 부서졌다. 뜨거운 찻물이 손가락 사이로 흘렀다"
6. 서술자 결론 삭제: ✗"이 순간 그는 마침내 힘의 의미를 깨달았다" → ✓ 행동만 보여주고 독자가 느끼게
7. 군중 반응 구체화: ✗"모두가 놀랐다" → ✓"장 노인이 담배를 바지 위에 떨어뜨렸고, 화상에 벌떡 일어났다"
8. 문단 길이 차별화: 동일 길이 문단 금지. 한 줄짜리 문단도 있고 7~8줄 문단도 있어야
9. "마치", "불현듯", "저도 모르게" 등 AI 표지어 제거: 구체적 감각 묘사로 교체
10. 존댓말/반말 일관성 점검: 인물별 어미(-다/-요/-습니다) 혼용 금지
11. 한국식 호칭 체계: 형/누나/오빠/언니·선배/후배 등 관계 기반 호칭을 자연스럽게 유지`,
  "spot-fix": "정밀 수정: 감수 의견이 지적한 특정 문장이나 문단만 수정하고, 나머지 모든 내용은 원본 그대로 유지합니다. 수정 범위는 문제 문장 및 전후 각 1문장으로 한정합니다. 무관한 문단 변경 금지",
};

export class ReviserAgent extends BaseAgent {
  get name(): string {
    return "reviser";
  }

  async reviseChapter(
    bookDir: string,
    chapterContent: string,
    chapterNumber: number,
    issues: ReadonlyArray<AuditIssue>,
    mode: ReviseMode = DEFAULT_REVISE_MODE,
    genre?: string,
    options?: {
      chapterIntent?: string;
      contextPackage?: ContextPackage;
      ruleStack?: RuleStack;
      lengthSpec?: LengthSpec;
    },
  ): Promise<ReviseOutput> {
    const [currentState, ledger, hooks, styleGuideRaw, volumeOutline, storyBible, characterMatrix, chapterSummaries, parentCanon, fanficCanon] = await Promise.all([
      this.readFileSafe(join(bookDir, "story/current_state.md")),
      this.readFileSafe(join(bookDir, "story/particle_ledger.md")),
      this.readFileSafe(join(bookDir, "story/pending_hooks.md")),
      this.readFileSafe(join(bookDir, "story/style_guide.md")),
      this.readFileSafe(join(bookDir, "story/volume_outline.md")),
      this.readFileSafe(join(bookDir, "story/story_bible.md")),
      this.readFileSafe(join(bookDir, "story/character_matrix.md")),
      this.readFileSafe(join(bookDir, "story/chapter_summaries.md")),
      this.readFileSafe(join(bookDir, "story/parent_canon.md")),
      this.readFileSafe(join(bookDir, "story/fanfic_canon.md")),
    ]);

    // Load genre profile and book rules
    const genreId = genre ?? "other";
    const [{ profile: gp }, bookLanguage] = await Promise.all([
      readGenreProfile(this.ctx.projectRoot, genreId),
      readBookLanguage(bookDir),
    ]);
    const parsedRules = await readBookRules(bookDir);
    const bookRules = parsedRules?.rules ?? null;

    // Fallback: use book_rules body when style_guide.md doesn't exist
    const styleGuide = styleGuideRaw !== "(文件不存在)"
      ? styleGuideRaw
      : (parsedRules?.body ?? "(无文风指南)");

    const resolvedLangRaw = bookLanguage ?? gp.language;
    const isEnglish = resolvedLangRaw === "en";
    const isKorean = resolvedLangRaw === "ko";

    const issueList = issues
      .map((i) => `- [${i.severity}] ${i.category}: ${i.description}\n  ${isKorean ? "제안" : "建议"}: ${i.suggestion}`)
      .join("\n");

    const numericalRule = gp.numericalSystem
      ? "\n3. 数值错误必须精确修正，前后对账"
      : "";
    const protagonistBlock = bookRules?.protagonist
      ? `\n\n主角人设锁定：${bookRules.protagonist.name}，${bookRules.protagonist.personalityLock.join("、")}。修改不得违反人设。`
      : "";
    const lengthGuardrail = options?.lengthSpec
      ? `\n8. 保持章节字数在目标区间内；只有在修复关键问题确实需要时才允许轻微偏离`
      : "";
    const resolvedLanguage = isEnglish ? "en" : isKorean ? "ko" : "zh";
    const langPrefix = isEnglish
      ? mode === "spot-fix"
        ? `【LANGUAGE OVERRIDE】ALL output (FIXED_ISSUES, PATCHES, UPDATED_STATE, UPDATED_HOOKS) MUST be in English. Every TARGET_TEXT and REPLACEMENT_TEXT must be written entirely in English.\n\n`
        : `【LANGUAGE OVERRIDE】ALL output (FIXED_ISSUES, REVISED_CONTENT, UPDATED_STATE, UPDATED_HOOKS) MUST be in English. The revised chapter content must be written entirely in English.\n\n`
      : isKorean
        ? mode === "spot-fix"
          ? `【언어 설정】모든 출력(FIXED_ISSUES, PATCHES, UPDATED_STATE, UPDATED_HOOKS)은 반드시 한국어로 작성하세요. TARGET_TEXT와 REPLACEMENT_TEXT 모두 한국어로 작성해야 합니다.\n\n`
          : `【언어 설정】모든 출력(FIXED_ISSUES, REVISED_CONTENT, UPDATED_STATE, UPDATED_HOOKS)은 반드시 한국어로 작성하세요. 수정된 회차 본문은 반드시 한국어로 작성해야 합니다.\n\n`
        : "";
    const governedMode = Boolean(options?.chapterIntent && options?.contextPackage && options?.ruleStack);
    const hooksWorkingSet = governedMode && options?.contextPackage
      ? buildGovernedHookWorkingSet({
          hooksMarkdown: hooks,
          contextPackage: options.contextPackage,
          chapterNumber,
          language: resolvedLanguage,
        })
      : hooks;
    const chapterSummariesWorkingSet = governedMode
      ? filterSummaries(chapterSummaries, chapterNumber)
      : chapterSummaries;
    const characterMatrixWorkingSet = governedMode
      ? buildGovernedCharacterMatrixWorkingSet({
          matrixMarkdown: characterMatrix,
          chapterIntent: options?.chapterIntent ?? volumeOutline,
          contextPackage: options!.contextPackage!,
          protagonistName: bookRules?.protagonist?.name,
        })
      : characterMatrix;

    const modeDesc = isKorean ? MODE_DESCRIPTIONS_KO[mode] : MODE_DESCRIPTIONS[mode];

    const outputFormat = isKorean
      ? (mode === "spot-fix"
        ? `=== FIXED_ISSUES ===
(수정한 내용을 항목별로 설명, 한 줄에 하나씩; 안전한 정밀 수정이 불가능한 경우에도 여기에 설명)

=== PATCHES ===
(교체할 국소 패치만 출력. 전체 회차 재작성 금지. 아래 형식, PATCH 블록 반복 가능)
--- PATCH 1 ---
TARGET_TEXT:
(원문에서 정확히 복사하여 유일하게 매칭되는 원래 문장 또는 문단)
REPLACEMENT_TEXT:
(교체 후 국소 텍스트)
--- END PATCH ---

=== UPDATED_STATE ===
(갱신된 전체 상태 카드)
${gp.numericalSystem ? "\n=== UPDATED_LEDGER ===\n(갱신된 전체 자원 장부)" : ""}
=== UPDATED_HOOKS ===
(갱신된 전체 복선 풀)`
        : `=== FIXED_ISSUES ===
(수정한 내용을 항목별로 설명, 한 줄에 하나씩)

=== REVISED_CONTENT ===
(수정 완료된 전체 본문)

=== UPDATED_STATE ===
(갱신된 전체 상태 카드)
${gp.numericalSystem ? "\n=== UPDATED_LEDGER ===\n(갱신된 전체 자원 장부)" : ""}
=== UPDATED_HOOKS ===
(갱신된 전체 복선 풀)`)
      : (mode === "spot-fix"
        ? `=== FIXED_ISSUES ===
(逐条说明修正了什么，一行一条；如果无法安全定点修复，也在这里说明)

=== PATCHES ===
(只输出需要替换的局部补丁，不得输出整章重写。格式如下，可重复多个 PATCH 区块)
--- PATCH 1 ---
TARGET_TEXT:
(必须从原文中精确复制、且能唯一命中的原句或原段)
REPLACEMENT_TEXT:
(替换后的局部文本)
--- END PATCH ---

=== UPDATED_STATE ===
(更新后的完整状态卡)
${gp.numericalSystem ? "\n=== UPDATED_LEDGER ===\n(更新后的完整资源账本)" : ""}
=== UPDATED_HOOKS ===
(更新后的完整伏笔池)`
        : `=== FIXED_ISSUES ===
(逐条说明修正了什么，一行一条)

=== REVISED_CONTENT ===
(修正后的完整正文)

=== UPDATED_STATE ===
(更新后的完整状态卡)
${gp.numericalSystem ? "\n=== UPDATED_LEDGER ===\n(更新后的完整资源账本)" : ""}
=== UPDATED_HOOKS ===
(更新后的完整伏笔池)`);

    const protagonistLockLabel = isKorean
      ? (bookRules?.protagonist
        ? `\n\n주인공 설정 잠금: ${bookRules.protagonist.name}, ${bookRules.protagonist.personalityLock.join("·")}. 수정 시 인물 설정을 위반하지 마세요.`
        : "")
      : protagonistBlock;

    const systemPrompt = isKorean
      ? `${langPrefix}당신은 전문 ${gp.name} 웹소설 감수 편집자입니다. 감수 의견에 따라 회차를 수정하는 것이 당신의 임무입니다.${protagonistLockLabel}

감수 모드: ${modeDesc}

감수 원칙:
1. 모드에 따라 수정 범위를 제어하세요
2. 근본 원인을 수정하세요. 표면적 윤문이 아닙니다${isKorean && gp.numericalSystem ? "\n3. 수치 오류는 정밀하게 수정하고 전후 대조 검증하세요" : numericalRule}
4. 복선 상태는 반드시 복선 풀과 동기화하세요
5. 스토리 방향과 핵심 갈등을 변경하지 마세요
6. 원문의 어체와 리듬을 유지하세요 (존댓말/반말 일관성 포함)
7. 수정 후 상태 카드${gp.numericalSystem ? "·장부" : ""}·복선 풀을 동기화하세요
${lengthGuardrail ? "\n8. 회차 글자 수를 목표 범위 내로 유지하세요. 핵심 문제 해결에 꼭 필요한 경우에만 경미한 편차를 허용합니다" : ""}
${mode === "spot-fix" ? "\n9. spot-fix는 국소 패치만 출력 가능하며, 전체 회차 재작성 금지. TARGET_TEXT는 원문에서 유일하게 매칭되어야 합니다\n10. 대규모 개작이 필요한 경우 안전한 spot-fix가 불가능함을 설명하고 PATCHES를 비워 두세요" : ""}

출력 형식:

${outputFormat}`
      : `${langPrefix}你是一位专业的${gp.name}网络小说修稿编辑。你的任务是根据审稿意见对章节进行修正。${protagonistBlock}

修稿模式：${modeDesc}

修稿原则：
1. 按模式控制修改幅度
2. 修根因，不做表面润色${numericalRule}
4. 伏笔状态必须与伏笔池同步
5. 不改变剧情走向和核心冲突
6. 保持原文的语言风格和节奏
7. 修改后同步更新状态卡${gp.numericalSystem ? "、账本" : ""}、伏笔池
${lengthGuardrail}
${mode === "spot-fix" ? "\n9. spot-fix 只能输出局部补丁，禁止输出整章改写；TARGET_TEXT 必须能在原文中唯一命中\n10. 如果需要大面积改写，说明无法安全 spot-fix，并让 PATCHES 留空" : ""}

输出格式：

${outputFormat}`;

    const fileNotExist = "(文件不存在)";
    const ledgerBlock = gp.numericalSystem
      ? `\n## ${isKorean ? "자원 장부" : "资源账本"}\n${ledger}`
      : "";
    const governedMemoryBlocks = options?.contextPackage
      ? buildGovernedMemoryEvidenceBlocks(options.contextPackage, resolvedLanguage)
      : undefined;
    const hookDebtBlock = governedMemoryBlocks?.hookDebtBlock ?? "";
    const hooksBlock = governedMemoryBlocks?.hooksBlock
      ?? `\n## ${isKorean ? "복선 풀" : "伏笔池"}\n${hooksWorkingSet}\n`;
    const outlineBlock = volumeOutline !== fileNotExist
      ? `\n## ${isKorean ? "볼륨 아웃라인" : "卷纲"}\n${volumeOutline}\n`
      : "";
    const bibleBlock = !governedMode && storyBible !== fileNotExist
      ? `\n## ${isKorean ? "세계관 설정" : "世界观设定"}\n${storyBible}\n`
      : "";
    const matrixBlock = characterMatrixWorkingSet !== fileNotExist
      ? `\n## ${isKorean ? "인물 관계 매트릭스" : "角色交互矩阵"}\n${characterMatrixWorkingSet}\n`
      : "";
    const summariesBlock = governedMemoryBlocks?.summariesBlock
      ?? (chapterSummariesWorkingSet !== fileNotExist
        ? `\n## ${isKorean ? "회차 요약" : "章节摘要"}\n${chapterSummariesWorkingSet}\n`
        : "");
    const volumeSummariesBlock = governedMemoryBlocks?.volumeSummariesBlock ?? "";

    const hasParentCanon = parentCanon !== fileNotExist;
    const hasFanficCanon = fanficCanon !== fileNotExist;

    const canonBlock = hasParentCanon
      ? isKorean
        ? `\n## 원작 원전 참조 (감수 전용)\n본 작품은 스핀오프입니다. 수정 시 원전 제약을 참조하며, 원전 사실을 변경할 수 없습니다.\n${parentCanon}\n`
        : `\n## 正传正典参照（修稿专用）\n本书为番外作品。修改时参照正典约束，不可改变正典事实。\n${parentCanon}\n`
      : "";

    const fanficCanonBlock = hasFanficCanon
      ? isKorean
        ? `\n## 2차 창작 원전 참조 (감수 전용)\n본 작품은 2차 창작물입니다. 수정 시 원전 캐릭터 프로필과 세계 규칙을 참조하며, 원전 사실을 위반할 수 없습니다. 캐릭터 대사는 원작의 말버릇을 유지해야 합니다.\n${fanficCanon}\n`
        : `\n## 同人正典参照（修稿专用）\n本书为同人作品。修改时参照正典角色档案和世界规则，不可违反正典事实。角色对话必须保留原作语癖。\n${fanficCanon}\n`
      : "";
    const reducedControlBlock = options?.chapterIntent && options.contextPackage && options.ruleStack
      ? this.buildReducedControlBlock(options.chapterIntent, options.contextPackage, options.ruleStack, isKorean)
      : "";
    const lengthGuidanceBlock = options?.lengthSpec
      ? isKorean
        ? `\n## 글자 수 가드레일\n목표 글자 수: ${options.lengthSpec.target}\n허용 범위: ${options.lengthSpec.softMin}-${options.lengthSpec.softMax}\n극한 범위: ${options.lengthSpec.hardMin}-${options.lengthSpec.hardMax}\n수정 후 허용 범위를 초과하면 중복 설명·반복 동작·약정보 문장을 우선 압축하세요. 서브플롯을 추가하거나 핵심 사실을 삭제하지 마세요.\n`
        : `\n## 字数护栏\n目标字数：${options.lengthSpec.target}\n允许区间：${options.lengthSpec.softMin}-${options.lengthSpec.softMax}\n极限区间：${options.lengthSpec.hardMin}-${options.lengthSpec.hardMax}\n如果修正后超出允许区间，请优先压缩冗余解释、重复动作和弱信息句，不得新增支线或删掉核心事实。\n`
      : "";
    const styleGuideBlock = reducedControlBlock.length === 0
      ? `\n## ${isKorean ? "문체 가이드" : "文风指南"}\n${styleGuide}`
      : "";

    const userPrompt = isKorean
      ? `${chapterNumber}화를 수정하세요.

## 감수 의견
${issueList}

## 현재 상태 카드
${currentState}
${ledgerBlock}
${hookDebtBlock}${hooksBlock}${volumeSummariesBlock}${reducedControlBlock || outlineBlock}${bibleBlock}${matrixBlock}${summariesBlock}${canonBlock}${fanficCanonBlock}${styleGuideBlock}${lengthGuidanceBlock}

## 수정 대상 회차
${chapterContent}`
      : `请修正第${chapterNumber}章。

## 审稿问题
${issueList}

## 当前状态卡
${currentState}
${ledgerBlock}
${hookDebtBlock}${hooksBlock}${volumeSummariesBlock}${reducedControlBlock || outlineBlock}${bibleBlock}${matrixBlock}${summariesBlock}${canonBlock}${fanficCanonBlock}${styleGuideBlock}${lengthGuidanceBlock}

## 待修正章节
${chapterContent}`;

    const maxTokens = mode === "spot-fix" ? 8192 : 16384;

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, maxTokens },
    );

    const output = this.parseOutput(response.content, gp, mode, chapterContent);
    const mergedOutput = governedMode
      ? {
          ...output,
          updatedHooks: mergeTableMarkdownByKey(hooks, output.updatedHooks, [0]),
        }
      : output;
    const wordCount = options?.lengthSpec
      ? countChapterLength(mergedOutput.revisedContent, options.lengthSpec.countingMode)
      : mergedOutput.wordCount;
    return { ...mergedOutput, wordCount, tokenUsage: response.usage };
  }

  private parseOutput(
    content: string,
    gp: GenreProfile,
    mode: ReviseMode,
    originalChapter: string,
  ): ReviseOutput {
    const extract = (tag: string): string => {
      const regex = new RegExp(
        `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
      );
      const match = content.match(regex);
      return match?.[1]?.trim() ?? "";
    };

    const fixedRaw = extract("FIXED_ISSUES");
    const fixedIssues = fixedRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (mode === "spot-fix") {
      const patches = parseSpotFixPatches(extract("PATCHES"));
      const patchResult = applySpotFixPatches(originalChapter, patches);

      return {
        revisedContent: patchResult.revisedContent,
        wordCount: patchResult.revisedContent.length,
        fixedIssues: patchResult.applied ? fixedIssues : [],
        updatedState: extract("UPDATED_STATE") || "(状态卡未更新)",
        updatedLedger: gp.numericalSystem
          ? (extract("UPDATED_LEDGER") || "(账本未更新)")
          : "",
        updatedHooks: extract("UPDATED_HOOKS") || "(伏笔池未更新)",
      };
    }

    const revisedContent = extract("REVISED_CONTENT");

    return {
      revisedContent,
      wordCount: revisedContent.length,
      fixedIssues,
      updatedState: extract("UPDATED_STATE") || "(状态卡未更新)",
      updatedLedger: gp.numericalSystem
        ? (extract("UPDATED_LEDGER") || "(账本未更新)")
        : "",
      updatedHooks: extract("UPDATED_HOOKS") || "(伏笔池未更新)",
    };
  }

  private async readFileSafe(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return "(文件不存在)";
    }
  }

  private buildReducedControlBlock(
    chapterIntent: string,
    contextPackage: ContextPackage,
    ruleStack: RuleStack,
    isKorean = false,
  ): string {
    const selectedContext = contextPackage.selectedContext
      .map((entry) => `- ${entry.source}: ${entry.reason}${entry.excerpt ? ` | ${entry.excerpt}` : ""}`)
      .join("\n");
    const overrides = ruleStack.activeOverrides.length > 0
      ? ruleStack.activeOverrides
        .map((override) => `- ${override.from} -> ${override.to}: ${override.reason} (${override.target})`)
        .join("\n")
      : "- none";

    if (isKorean) {
      const sep = "·";
      return `\n## 본 회차 제어 입력 (Planner/Composer 컴파일)
${chapterIntent}

### 선택된 컨텍스트
${selectedContext || "- none"}

### 규칙 스택
- 하드 가드레일: ${ruleStack.sections.hard.join(sep) || "(없음)"}
- 소프트 제약: ${ruleStack.sections.soft.join(sep) || "(없음)"}
- 진단 규칙: ${ruleStack.sections.diagnostic.join(sep) || "(없음)"}

### 현재 오버라이드
${overrides}\n`;
    }

    return `\n## 本章控制输入（由 Planner/Composer 编译）
${chapterIntent}

### 已选上下文
${selectedContext || "- none"}

### 规则栈
- 硬护栏：${ruleStack.sections.hard.join("、") || "(无)"}
- 软约束：${ruleStack.sections.soft.join("、") || "(无)"}
- 诊断规则：${ruleStack.sections.diagnostic.join("、") || "(无)"}

### 当前覆盖
${overrides}\n`;
  }
}
