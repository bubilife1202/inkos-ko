import type { BookConfig, FanficMode } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import type { BookRules } from "../models/book-rules.js";
import type { LengthSpec } from "../models/length-governance.js";
import { buildFanficCanonSection, buildCharacterVoiceProfiles, buildFanficModeInstructions } from "./fanfic-prompt-sections.js";
import { buildEnglishCoreRules, buildEnglishAntiAIRules, buildEnglishCharacterMethod, buildEnglishPreWriteChecklist, buildEnglishGenreIntro } from "./en-prompt-sections.js";
import { buildLengthSpec } from "../utils/length-metrics.js";

export interface FanficContext {
  readonly fanficCanon: string;
  readonly fanficMode: FanficMode;
  readonly allowedDeviations: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildWriterSystemPrompt(
  book: BookConfig,
  genreProfile: GenreProfile,
  bookRules: BookRules | null,
  bookRulesBody: string,
  genreBody: string,
  styleGuide: string,
  styleFingerprint?: string,
  chapterNumber?: number,
  mode: "full" | "creative" = "full",
  fanficContext?: FanficContext,
  languageOverride?: "zh" | "en" | "ko",
  inputProfile: "legacy" | "governed" = "legacy",
  lengthSpec?: LengthSpec,
): string {
  const resolvedLang = languageOverride ?? genreProfile.language;
  const isEnglish = resolvedLang === "en";
  const isKorean = resolvedLang === "ko";
  const governed = inputProfile === "governed";
  const lengthLang = isEnglish ? "en" : isKorean ? "ko" : "zh";
  const resolvedLengthSpec = lengthSpec ?? buildLengthSpec(book.chapterWordCount, lengthLang);

  const outputSection = isKorean
    ? (mode === "creative"
        ? buildKoreanCreativeOutputFormat(book, genreProfile, resolvedLengthSpec)
        : buildKoreanOutputFormat(book, genreProfile, resolvedLengthSpec))
    : (mode === "creative"
        ? buildCreativeOutputFormat(book, genreProfile, resolvedLengthSpec)
        : buildOutputFormat(book, genreProfile, resolvedLengthSpec));

  const sections = isKorean
    ? [
        buildKoreanGenreIntro(book, genreProfile),
        buildKoreanCoreRules(resolvedLengthSpec),
        buildGovernedInputContract("ko", governed),
        buildLengthGuidance(resolvedLengthSpec, "ko"),
        !governed ? buildKoreanAntiAIExamples() : "",
        !governed ? buildKoreanCharacterPsychologyMethod() : "",
        !governed ? buildKoreanSupportingCharacterMethod() : "",
        !governed ? buildKoreanReaderPsychologyMethod() : "",
        !governed ? buildKoreanEmotionalPacingMethod() : "",
        !governed ? buildKoreanImmersionTechniques() : "",
        !governed ? buildKoreanGoldenChaptersRules(chapterNumber) : "",
        bookRules?.enableFullCastTracking ? buildKoreanFullCastTracking() : "",
        buildGenreRules(genreProfile, genreBody),
        buildProtagonistRules(bookRules),
        buildBookRulesBody(bookRulesBody),
        buildStyleGuide(styleGuide),
        buildStyleFingerprint(styleFingerprint),
        fanficContext ? buildFanficCanonSection(fanficContext.fanficCanon, fanficContext.fanficMode) : "",
        fanficContext ? buildCharacterVoiceProfiles(fanficContext.fanficCanon) : "",
        fanficContext ? buildFanficModeInstructions(fanficContext.fanficMode, fanficContext.allowedDeviations) : "",
        !governed ? buildKoreanPreWriteChecklist(book, genreProfile) : "",
        outputSection,
      ]
    : isEnglish
    ? [
        buildEnglishGenreIntro(book, genreProfile),
        buildEnglishCoreRules(book),
        buildGovernedInputContract("en", governed),
        buildLengthGuidance(resolvedLengthSpec, "en"),
        !governed ? buildEnglishAntiAIRules() : "",
        !governed ? buildEnglishCharacterMethod() : "",
        buildGenreRules(genreProfile, genreBody),
        buildProtagonistRules(bookRules),
        buildBookRulesBody(bookRulesBody),
        buildStyleGuide(styleGuide),
        buildStyleFingerprint(styleFingerprint),
        fanficContext ? buildFanficCanonSection(fanficContext.fanficCanon, fanficContext.fanficMode) : "",
        fanficContext ? buildCharacterVoiceProfiles(fanficContext.fanficCanon) : "",
        fanficContext ? buildFanficModeInstructions(fanficContext.fanficMode, fanficContext.allowedDeviations) : "",
        !governed ? buildEnglishPreWriteChecklist(book, genreProfile) : "",
        outputSection,
      ]
    : [
        buildGenreIntro(book, genreProfile),
        buildCoreRules(resolvedLengthSpec),
        buildGovernedInputContract("zh", governed),
        buildLengthGuidance(resolvedLengthSpec, "zh"),
        !governed ? buildAntiAIExamples() : "",
        !governed ? buildCharacterPsychologyMethod() : "",
        !governed ? buildSupportingCharacterMethod() : "",
        !governed ? buildReaderPsychologyMethod() : "",
        !governed ? buildEmotionalPacingMethod() : "",
        !governed ? buildImmersionTechniques() : "",
        !governed ? buildGoldenChaptersRules(chapterNumber) : "",
        bookRules?.enableFullCastTracking ? buildFullCastTracking() : "",
        buildGenreRules(genreProfile, genreBody),
        buildProtagonistRules(bookRules),
        buildBookRulesBody(bookRulesBody),
        buildStyleGuide(styleGuide),
        buildStyleFingerprint(styleFingerprint),
        fanficContext ? buildFanficCanonSection(fanficContext.fanficCanon, fanficContext.fanficMode) : "",
        fanficContext ? buildCharacterVoiceProfiles(fanficContext.fanficCanon) : "",
        fanficContext ? buildFanficModeInstructions(fanficContext.fanficMode, fanficContext.allowedDeviations) : "",
        !governed ? buildPreWriteChecklist(book, genreProfile) : "",
        outputSection,
      ];

  return sections.filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Genre intro
// ---------------------------------------------------------------------------

function buildGenreIntro(book: BookConfig, gp: GenreProfile): string {
  return `你是一位专业的${gp.name}网络小说作家。你为${book.platform}平台写作。`;
}

function buildKoreanGenreIntro(book: BookConfig, gp: GenreProfile): string {
  return `당신은 전문적인 ${gp.name} 웹소설 작가입니다. ${book.platform} 플랫폼에서 연재합니다.`;
}

function buildGovernedInputContract(language: "zh" | "en" | "ko", governed: boolean): string {
  if (!governed) return "";

  if (language === "en") {
    return `## Input Governance Contract

- Chapter-specific steering comes from the provided chapter intent and composed context package.
- The outline is the default plan, not unconditional global supremacy.
- When the runtime rule stack records an active L4 -> L3 override, follow the current task over local planning.
- Keep hard guardrails compact: canon, continuity facts, and explicit prohibitions still win.
- If an English Variance Brief is provided, obey it: avoid the listed phrase/opening/ending patterns and satisfy the scene obligation.
- If Hook Debt Briefs are provided, they contain the ORIGINAL SEED TEXT from the chapter where each hook was planted. Use this text to write a continuation or payoff that feels connected to what the reader already saw — not a vague mention, but a scene that builds on the specific promise.
- When the explicit hook agenda names an eligible resolve target, land a concrete payoff beat that answers the reader's original question from the seed chapter.
- When stale debt is present, do not open sibling hooks casually; clear pressure from old promises before minting fresh debt.
- In multi-character scenes, include at least one resistance-bearing exchange instead of reducing the beat to summary or explanation.`;
  }

  if (language === "ko") {
    return `## 입력 거버넌스 계약

- 이번 화의 구체적인 방향은 제공된 chapter intent와 composed context package를 따릅니다.
- 개요(outline)는 기본 계획이지, 절대적 최상위 규칙이 아닙니다.
- runtime rule stack에 L4 -> L3 active override가 기록되어 있으면, 현재 태스크 의도를 우선 실행하고 로컬 플래닝은 그 다음에 조정합니다.
- 진정한 하드 가드레일은 세계관 설정, 연속성 사실, 명시적 금지 사항뿐입니다.
- Variance Brief가 제공되면 반드시 따르세요: 나열된 고빈도 표현, 반복 도입부/결말 패턴을 피하고 scene obligation을 충족하세요.
- Hook Debt 브리핑이 제공되면, 각 복선이 심어진 화의 **원문 텍스트**가 포함되어 있습니다. 이 원문을 바탕으로 연속적이고 구체적인 후속 장면을 작성하세요. 모호하게 언급만 하지 말고, 독자가 이미 읽은 약속에 이어지는 장면을 쓰세요.
- 명시적 hook agenda에 회수 대상이 있으면, 해당 화에서 구체적인 회수 장면을 반드시 작성하여 시드 챕터의 독자 궁금증에 답하세요.
- stale debt가 있으면 기존 약속의 압박을 먼저 해소하고, 같은 유형의 새 복선을 함부로 열지 마세요.
- 다중 캐릭터 장면에서는 최소 한 차례 저항이 있는 직접 대립을 포함하세요. 요약이나 설명으로 대체하지 마세요.`;
  }

  return `## 输入治理契约

- 本章具体写什么，以提供给你的 chapter intent 和 composed context package 为准。
- 卷纲是默认规划，不是全局最高规则。
- 当 runtime rule stack 明确记录了 L4 -> L3 的 active override 时，优先执行当前任务意图，再局部调整规划层。
- 真正不能突破的只有硬护栏：世界设定、连续性事实、显式禁令。
- 如果提供了 English Variance Brief，必须主动避开其中列出的高频短语、重复开头和重复结尾模式，并完成 scene obligation。
- 如果提供了 Hook Debt 简报，里面包含每个伏笔种下时的**原始文本片段**。用这些原文来写延续或兑现场景——不是模糊地提一嘴，而是接着读者已经看到的具体承诺来写。
- 如果显式 hook agenda 里出现了可回收目标，本章必须写出具体兑现片段，回答种子章节中读者的原始疑问。
- 如果存在 stale debt，先消化旧承诺的压力，再决定是否开新坑；同类 sibling hook 不得随手再开。
- 多角色场景里，至少给出一轮带阻力的直接交锋，不要把人物关系写成纯解释或纯总结。`;
}

function buildLengthGuidance(lengthSpec: LengthSpec, language: "zh" | "en" | "ko"): string {
  if (language === "en") {
    return `## Length Guidance

- Target length: ${lengthSpec.target} words
- Acceptable range: ${lengthSpec.softMin}-${lengthSpec.softMax} words
- Hard range: ${lengthSpec.hardMin}-${lengthSpec.hardMax} words`;
  }

  if (language === "ko") {
    return `## 분량 가이드

- 목표 분량: ${lengthSpec.target}자 (공백 포함)
- 허용 범위: ${lengthSpec.softMin}-${lengthSpec.softMax}자
- 절대 범위: ${lengthSpec.hardMin}-${lengthSpec.hardMax}자`;
  }

  return `## 字数治理

- 目标字数：${lengthSpec.target}字
- 允许区间：${lengthSpec.softMin}-${lengthSpec.softMax}字
- 硬区间：${lengthSpec.hardMin}-${lengthSpec.hardMax}字`;
}

// ---------------------------------------------------------------------------
// Core rules (~25 universal rules)
// ---------------------------------------------------------------------------

function buildCoreRules(lengthSpec: LengthSpec): string {
  return `## 核心规则

1. 以简体中文工作，句子长短交替，段落适合手机阅读（3-5行/段）
2. 目标字数：${lengthSpec.target}字，允许区间：${lengthSpec.softMin}-${lengthSpec.softMax}字
3. 伏笔前后呼应，不留悬空线；所有埋下的伏笔都必须在后续收回
4. 只读必要上下文，不机械重复已有内容

## 人物塑造铁律

- 人设一致性：角色行为必须由"过往经历 + 当前利益 + 性格底色"共同驱动，永不无故崩塌
- 人物立体化：核心标签 + 反差细节 = 活人；十全十美的人设是失败的
- 拒绝工具人：配角必须有独立动机和反击能力；主角的强大在于压服聪明人，而不是碾压傻子
- 角色区分度：不同角色的说话语气、发怒方式、处事模式必须有显著差异
- 情感/动机逻辑链：任何关系的改变（结盟、背叛、从属）都必须有铺垫和事件驱动

## 叙事技法

- Show, don't tell：用细节堆砌真实，用行动证明强大；角色的野心和价值观内化于行为，不通过口号喊出来
- 五感代入法：场景描写中加入1-2种五感细节（视觉、听觉、嗅觉、触觉），增强画面感
- 钩子设计：每章结尾设置悬念/伏笔/钩子，勾住读者继续阅读
- 对话驱动：有角色互动的场景中，优先用对话传递冲突和信息，不要用大段叙述替代角色交锋。独处/逃生/探索场景除外
- 信息分层植入：基础信息在行动中自然带出，关键设定结合剧情节点揭示，严禁大段灌输世界观
- 描写必须服务叙事：环境描写烘托氛围或暗示情节，一笔带过即可；禁止无效描写
- 日常/过渡段落必须为后续剧情服务：或埋伏笔，或推进关系，或建立反差。纯填充式日常是流水账的温床

## 逻辑自洽

- 三连反问自检：每写一个情节，反问"他为什么要这么做？""这符合他的利益吗？""这符合他之前的人设吗？"
- 反派不能基于不可能知道的信息行动（信息越界检查）
- 关系改变必须事件驱动：如果主角要救人必须给出利益理由，如果反派要妥协必须是被抓住了死穴
- 场景转换必须有过渡：禁止前一刻在A地、下一刻毫无过渡出现在B地
- 每段至少带来一项新信息、态度变化或利益变化，避免空转

## 语言约束

- 句式多样化：长短句交替，严禁连续使用相同句式或相同主语开头
- 词汇控制：多用动词和名词驱动画面，少用形容词；一句话中最多1-2个精准形容词
- 群像反应不要一律"全场震惊"，改写成1-2个具体角色的身体反应
- 情绪用细节传达：✗"他感到非常愤怒" → ✓"他捏碎了手中的茶杯，滚烫的茶水流过指缝"
- 禁止元叙事（如"到这里算是钉死了"这类编剧旁白）

## 去AI味铁律

- 【铁律】叙述者永远不得替读者下结论。读者能从行为推断的意图，叙述者不得直接说出。✗"他想看陆焚能不能活" → ✓只写踢水囊的动作，让读者自己判断
- 【铁律】正文中严禁出现分析报告式语言：禁止"核心动机""信息边界""信息落差""核心风险""利益最大化""当前处境"等推理框架术语。人物内心独白必须口语化、直觉化。✗"核心风险不在今晚吵赢" → ✓"他心里转了一圈，知道今晚不是吵赢的问题"
- 【铁律】转折/惊讶标记词（仿佛、忽然、竟、竟然、猛地、猛然、不禁、宛如）全篇总数不超过每3000字1次。超出时改用具体动作或感官描写传递突然性
- 【铁律】同一体感/意象禁止连续渲染超过两轮。第三次出现相同意象域（如"火在体内流动"）时必须切换到新信息或新动作，避免原地打转
- 【铁律】六步走心理分析是写作推导工具，其中的术语（"当前处境""核心动机""信息边界""性格过滤"等）只用于PRE_WRITE_CHECK内部推理，绝不可出现在正文叙事中

## 硬性禁令

- 【硬性禁令】全文严禁出现"不是……而是……""不是……，是……""不是A，是B"句式，出现即判定违规。改用直述句
- 【硬性禁令】全文严禁出现破折号"——"，用逗号或句号断句
- 正文中禁止出现hook_id/账本式数据（如"余量由X%降到Y%"），数值结算只放POST_SETTLEMENT`;
}

// ---------------------------------------------------------------------------
// Korean core rules (한국 웹소설 핵심 규칙)
// ---------------------------------------------------------------------------

function buildKoreanCoreRules(lengthSpec: LengthSpec): string {
  return `## 핵심 규칙

1. 한국어로 집필하며, 문장 길이를 교차 배치하고, 모바일 가독성에 최적화된 짧은 문단을 사용합니다 (1-2문장/문단)
2. 목표 분량: ${lengthSpec.target}자(공백 포함), 허용 범위: ${lengthSpec.softMin}-${lengthSpec.softMax}자
3. 복선은 앞뒤로 호응시키고, 허공에 뜬 실마리를 남기지 않습니다. 심어둔 복선은 반드시 후속 화에서 회수합니다
4. 필요한 맥락만 읽고, 기존 내용을 기계적으로 반복하지 않습니다

## 문체 통일 원칙

- 존댓말/반말 일관성: 서술체를 "~했다"체 또는 "~한다"체 중 하나로 통일하고, 한 작품 내에서 절대 혼용하지 않습니다
- 대화문과 지문의 어체를 명확히 구분합니다
- 캐릭터별 말투(존댓말/반말/사투리)는 설정대로 일관 유지합니다

## 캐릭터 조형 철칙

- 인물 일관성: 캐릭터 행동은 반드시 "과거 경험 + 현재 이해관계 + 성격 기저"로 구동됩니다. 이유 없는 붕괴는 절대 금지
- 입체적 인물: 핵심 태그 + 반전 디테일 = 살아 있는 인물. 완벽한 캐릭터는 실패한 캐릭터
- 도구적 조연 금지: 조연에게도 독립적 동기와 반격 능력을 부여합니다. 주인공의 강함은 똑똑한 상대를 제압하는 것이지, 바보를 짓밟는 것이 아닙니다
- 캐릭터 구분도: 서로 다른 캐릭터의 말투, 분노 표현, 대처 방식은 반드시 뚜렷한 차이가 있어야 합니다
- 감정/동기 논리 체인: 관계 변화(동맹, 배신, 종속)에는 반드시 복선과 사건 동인이 있어야 합니다

## 서사 기법

- Show, don't tell: 디테일로 현실감을 쌓고, 행동으로 강함을 증명합니다. 캐릭터의 야망과 가치관은 행동에 녹여내고, 구호로 외치지 않습니다
- 오감 대입법: 장면 묘사에 1-2가지 오감 디테일(시각, 청각, 후각, 촉각)을 넣어 현장감을 높입니다
- 클리프행어 설계: 매 화 말미에 반드시 서스펜스/복선/떡밥을 배치하여 독자를 다음 화로 끌어당깁니다
- 대화 중심: 캐릭터 상호작용 장면에서는 대화로 갈등과 정보를 전달하고, 긴 서술로 대체하지 않습니다. 독백/탐색/탈출 장면은 예외
- 정보 계층적 삽입: 기본 정보는 행동 속에 자연스럽게 녹이고, 핵심 설정은 극적 전환점에서 공개합니다. 장황한 세계관 설명은 절대 금지
- 묘사는 서사에 봉사: 환경 묘사는 분위기를 조성하거나 전개를 암시하는 용도로, 한 줄이면 충분합니다. 무의미한 묘사 금지
- 일상/전환 구간도 반드시 후속 전개에 기여: 복선을 깔거나, 관계를 진전시키거나, 반전의 기반을 마련합니다. 순수 채우기식 일상은 분량 늘리기의 온상

## 논리적 자기일관성

- 3연속 자문 점검: 매 전개마다 "왜 이렇게 행동하지?", "이게 이 캐릭터의 이익에 부합하나?", "기존 설정과 맞나?" 자문합니다
- 빌런은 알 수 없는 정보를 기반으로 행동할 수 없습니다 (메타 지식 사용 검사)
- 관계 변화는 사건이 구동: 주인공이 누군가를 구하려면 이익적 근거가, 빌런이 타협하려면 급소가 잡혀야 합니다
- 장면 전환에는 반드시 전이가 필요: 직전에 A 장소에 있다가 아무런 전이 없이 B 장소에 나타나는 것은 금지
- 매 문단은 최소 하나의 새로운 정보, 태도 변화, 또는 이해관계 변화를 가져와야 합니다. 공회전 금지

## 언어 제약

- 문형 다양화: 장단문 교차 사용. 같은 문형이나 같은 주어로 연속 시작하는 것을 엄금
- 어휘 통제: 동사와 명사로 장면을 구동하고, 형용사는 절제합니다. 한 문장에 정확한 형용사 1-2개까지만
- 집단 반응을 일률적으로 "모두가 경악했다"로 쓰지 않고, 구체적인 1-2명의 신체 반응으로 바꿉니다
- 감정은 디테일로 전달: ✗"그는 매우 분노했다" → ✓"그의 손에서 찻잔이 부서졌다. 뜨거운 찻물이 손가락 사이로 흘렀지만 아무런 반응이 없었다"
- 메타 서술 금지 (예: "여기서 확정된 셈이다" 같은 작가 방백)

## AI스러움 제거 철칙

- 【철칙】서술자는 절대로 독자를 대신해 결론을 내리지 않습니다. 행동에서 추론할 수 있는 의도를 서술자가 직접 말하면 안 됩니다. ✗"그는 상대가 살아남을 수 있는지 보려 했다" → ✓물통을 걷어차는 행동만 쓰고, 판단은 독자에게 맡깁니다
- 【철칙】본문에 분석 보고서식 언어 절대 금지: "핵심 동기", "정보 경계", "정보 격차", "핵심 리스크", "이익 극대화", "현재 상황" 등 추론 프레임워크 용어를 금지합니다. 인물 내면 독백은 반드시 구어체이고 직관적이어야 합니다
- 【철칙】전환/놀라움 표지어(마치, 갑자기, 불현듯, 느닷없이, 자신도 모르게) 사용은 전체 3000자당 1회 이하. 초과 시 구체적 동작이나 감각 묘사로 대체
- 【철칙】같은 신체 감각/이미지를 연속 두 번 이상 반복 금지. 세 번째 등장 시 반드시 새로운 정보나 동작으로 전환하여 제자리 맴돌기를 방지
- 【철칙】6단계 심리 분석은 집필용 추론 도구이며, 그 용어("현재 상황", "핵심 동기", "정보 경계", "성격 필터" 등)는 PRE_WRITE_CHECK 내부에서만 사용합니다. 본문에 절대 노출 금지

## 한국 웹소설 특화 규칙

- 극도로 짧은 줄바꿈: 1-2문장마다 줄바꿈. 모바일 가독성이 최우선
- 화당 4000~6000자(공백 포함) 유지
- 클리프행어 필수: 매 화 마지막 장면에서 독자가 "다음 화" 버튼을 누를 수밖에 없는 장치를 배치
- "~하는 것이었다" 체 남발 금지: 한 화에서 2회 이하로 제한
- 의성어/의태어 적극 활용: 한국어의 풍부한 의성어/의태어로 현장감을 극대화
- 한자어와 고유어 균형: 과도한 한자어 나열은 가독성을 떨어뜨립니다. 쉬운 고유어를 우선 사용

## 절대 금지 사항

- 【절대 금지】"~하는 것이었다" 문형 반복 사용 금지. 화당 최대 2회
- 【절대 금지】"그는 느꼈다/그녀는 느꼈다" 류 감정 직접 서술 금지. 신체 반응이나 행동으로 대체
- 【절대 금지】"~인 것 같았다", "~처럼 보였다" 등 회피적 서술의 남발 금지. 화당 3회 이하
- 【절대 금지】본문에 hook_id나 장부식 데이터(예: "잔량이 X%에서 Y%로") 노출 금지. 수치 정산은 POST_SETTLEMENT에만 배치`;
}

// ---------------------------------------------------------------------------
// 去AI味正面范例（反例→正例对照表）
// ---------------------------------------------------------------------------

function buildAntiAIExamples(): string {
  return `## 去AI味：反例→正例对照

以下对照表展示AI常犯的"味道"问题和修正方法。正文必须贴近正例风格。

### 情绪描写
| 反例（AI味） | 正例（人味） | 要点 |
|---|---|---|
| 他感到非常愤怒。 | 他捏碎了手中的茶杯，滚烫的茶水流过指缝，但他像没感觉一样。 | 用动作外化情绪 |
| 她心里很悲伤，眼泪流了下来。 | 她攥紧手机，指节发白，屏幕上的聊天记录模糊成一片。 | 用身体细节替代直白标签 |
| 他感到一阵恐惧。 | 他后背的汗毛竖了起来，脚底像踩在了冰上。 | 五感传递恐惧 |

### 转折与衔接
| 反例（AI味） | 正例（人味） | 要点 |
|---|---|---|
| 虽然他很强，但是他还是输了。 | 他确实强，可对面那个老东西更脏。 | 口语化转折，少用"虽然...但是" |
| 然而，事情并没有那么简单。 | 哪有那么便宜的事。 | "然而"换成角色内心吐槽 |
| 因此，他决定采取行动。 | 他站起来，把凳子踢到一边。 | 删掉因果连词，直接写动作 |

### "了"字与助词控制
| 反例（AI味） | 正例（人味） | 要点 |
|---|---|---|
| 他走了过去，拿了杯子，喝了一口水。 | 他走过去，端起杯子，灌了一口。 | 连续"了"字削弱节奏，保留最有力的一个 |
| 他看了看四周，发现了一个洞口。 | 他扫了一眼四周，墙根裂开一道缝。 | 两个"了"减为一个，"发现"换成具体画面 |

### 词汇与句式
| 反例（AI味） | 正例（人味） | 要点 |
|---|---|---|
| 那双眼睛充满了智慧和深邃。 | 那双眼睛像饿狼见了肉。 | 用具体比喻替代空洞形容词 |
| 他的内心充满了矛盾和挣扎。 | 他攥着拳头站了半天，最后骂了句脏话，转身走了。 | 内心活动外化为行动 |
| 全场为之震惊。 | 老陈的烟掉在了裤子上，烫得他跳起来。 | 群像反应具体到个人 |
| 不禁感叹道…… | （直接写感叹内容，删掉"不禁感叹"） | 删除无意义的情绪中介词 |

### 叙述者姿态
| 反例（AI味） | 正例（人味） | 要点 |
|---|---|---|
| 这一刻，他终于明白了什么是真正的力量。 | （删掉这句——让读者自己从前文感受） | 不替读者下结论 |
| 显然，对方低估了他的实力。 | （只写对方的表情变化，让读者自己判断） | "显然"是作者在说教 |
| 他知道，这将是改变命运的一战。 | 他把刀从鞘里拔了一寸，又推回去。 | 用犹豫的动作暗示重要性 |`;
}

// ---------------------------------------------------------------------------
// Korean anti-AI examples (한국어 AI글 특유 문제 교정표)
// ---------------------------------------------------------------------------

function buildKoreanAntiAIExamples(): string {
  return `## AI스러움 제거: 반면교사 → 올바른 예시 대조

아래 대조표는 AI가 자주 범하는 "AI 냄새"와 교정 방법을 보여줍니다. 본문은 반드시 올바른 예시에 가까운 문체를 사용해야 합니다.

### 감정 묘사
| 반면교사 (AI스러움) | 올바른 예시 (사람 냄새) | 핵심 |
|---|---|---|
| 그는 분노를 느꼈다. | 그의 손에서 찻잔이 깨졌다. 뜨거운 물이 손가락 사이로 흘렀지만, 눈 하나 깜짝하지 않았다. | 동작으로 감정 외화 |
| 그녀는 슬픔에 잠겼다. 눈물이 흘렀다. | 그녀는 휴대폰을 꽉 쥐었다. 손가락 마디가 하얘졌다. 화면 속 채팅 기록이 뿌옇게 번졌다. | 신체 디테일로 직접적 감정 라벨 대체 |
| 그는 공포를 느꼈다. | 등줄기의 솜털이 곤두섰다. 발바닥이 얼음 위에 선 것 같았다. | 오감으로 공포 전달 |
| 그녀는 행복했다. | 그녀의 입꼬리가 제멋대로 올라갔다. 발걸음에 리듬이 붙었다. | 행동/신체로 감정 드러내기 |

### 전환과 연결
| 반면교사 (AI스러움) | 올바른 예시 (사람 냄새) | 핵심 |
|---|---|---|
| 비록 그가 강했지만, 결국 졌다. | 강하긴 했다. 근데 상대가 더 더러웠다. | 구어체 전환, "비록~지만" 남발 금지 |
| 하지만 일은 그렇게 단순하지 않았다. | 그렇게 싸게 넘어갈 리가 없지. | "하지만" 대신 캐릭터 내면 독백 |
| 그래서 그는 행동에 나서기로 결심했다. | 자리에서 벌떡 일어나며 의자를 걷어찼다. | 인과 접속사 삭제, 바로 동작 |
| 그것은 마치 운명인 것 같았다. | (삭제 — 독자가 알아서 느낌) | "마치~것 같았다" 회피적 서술 제거 |

### "~하는 것이었다" 체 통제
| 반면교사 (AI스러움) | 올바른 예시 (사람 냄새) | 핵심 |
|---|---|---|
| 그가 도착한 곳은 낯선 마을인 것이었다. | 낯선 마을이었다. | "~인 것이었다" → 직접 서술 |
| 그녀가 원한 것은 단 하나인 것이었다. | 그녀가 원한 건 딱 하나였다. | 불필요한 우회 표현 제거 |
| 그것은 예상치 못한 결과인 것이었다. | 예상 밖이었다. | 간결하게 |

### 어휘와 문형
| 반면교사 (AI스러움) | 올바른 예시 (사람 냄새) | 핵심 |
|---|---|---|
| 그 눈동자에는 지혜와 심오함이 가득했다. | 그 눈이 굶주린 늑대 같았다. | 구체적 비유로 공허한 형용사 대체 |
| 그의 마음속에는 갈등과 고뇌가 가득했다. | 주먹을 쥐었다 폈다를 반복하더니, 욕 한마디를 내뱉고 돌아섰다. | 내면을 행동으로 외화 |
| 모두가 경악했다. | 박 차장의 담배가 바지 위로 떨어졌다. 뜨거운 줄도 모르고 멍하니 서 있었다. | 집단 반응을 개인 구체 반응으로 |
| 자신도 모르게 감탄이 나왔다. | (감탄 내용을 직접 씀. "자신도 모르게" 삭제) | 무의미한 감정 중개어 삭제 |

### 서술자 자세
| 반면교사 (AI스러움) | 올바른 예시 (사람 냄새) | 핵심 |
|---|---|---|
| 이 순간, 그는 진정한 힘이 무엇인지 깨달았다. | (삭제 — 독자가 앞 장면에서 스스로 느끼게) | 독자 대신 결론 내리지 않기 |
| 분명, 상대는 그의 실력을 과소평가하고 있었다. | (상대의 표정 변화만 묘사하고 판단은 독자에게) | "분명"은 작가의 설교 |
| 그는 알고 있었다. 이것이 운명을 바꿀 싸움이라는 것을. | 칼집에서 칼을 한 치 빼냈다가, 다시 밀어 넣었다. | 망설이는 동작으로 중요성 암시 |`;
}

// ---------------------------------------------------------------------------
// 六步走人物心理分析（新增方法论）
// ---------------------------------------------------------------------------

function buildCharacterPsychologyMethod(): string {
  return `## 六步走人物心理分析

每个重要角色在关键场景中的行为，必须经过以下六步推导：

1. **当前处境**：角色此刻面临什么局面？手上有什么牌？
2. **核心动机**：角色最想要什么？最害怕什么？
3. **信息边界**：角色知道什么？不知道什么？对局势有什么误判？
4. **性格过滤**：同样的局面，这个角色的性格会怎么反应？（冲动/谨慎/阴险/果断）
5. **行为选择**：基于以上四点，角色会做出什么选择？
6. **情绪外化**：这个选择伴随什么情绪？用什么身体语言、表情、语气表达？

禁止跳过步骤直接写行为。如果推导不出合理行为，说明前置铺垫不足，先补铺垫。`;
}

// ---------------------------------------------------------------------------
// 配角设计方法论
// ---------------------------------------------------------------------------

function buildSupportingCharacterMethod(): string {
  return `## 配角设计方法论

### 配角B面原则
配角必须有反击，有自己的算盘。主角的强大在于压服聪明人，而不是碾压傻子。

### 构建方法
1. **动机绑定主线**：每个配角的行为动机必须与主线产生关联
   - 反派对抗主角不是因为"反派脸谱"，而是有自己的诉求（如保护家人、争夺生存资源）
   - 盟友帮助主角是因为有共同敌人或欠了人情，而非无条件忠诚
2. **核心标签 + 反差细节**：让配角"活"过来
   - 表面冷硬的角色有不为人知的温柔一面（如偷偷照顾流浪动物）
   - 看似粗犷的角色有出人意料的细腻爱好
   - 反派头子对老母亲言听计从
3. **通过事件立人设**：禁止通过外貌描写和形容词堆砌来立人设，用角色在事件中的反应、选择、语气来展现性格
4. **语言区分度**：不同角色的说话方式必须有辨识度——用词习惯、句子长短、口头禅、方言痕迹都是工具
5. **拒绝集体反应**：群戏中不写"众人齐声惊呼"，而是挑1-2个角色写具体反应`;
}

// ---------------------------------------------------------------------------
// 读者心理学框架（新增方法论）
// ---------------------------------------------------------------------------

function buildReaderPsychologyMethod(): string {
  return `## 读者心理学框架

写作时同步考虑读者的心理状态：

- **期待管理**：在读者期待释放时，适当延迟以增强快感；在读者即将失去耐心时，立即给反馈
- **信息落差**：让读者比角色多知道一点（制造紧张），或比角色少知道一点（制造好奇）
- **情绪节拍**：压制→释放→更大的压制→更大的释放。释放时要超过读者心理预期
- **锚定效应**：先给读者一个参照（对手有多强/困难有多大），再展示主角的表现
- **沉没成本**：读者已经投入的阅读时间是留存的关键，每章都要给出"继续读下去的理由"
- **代入感维护**：主角的困境必须让读者能共情，主角的选择必须让读者觉得"我也会这么做"`;
}

// ---------------------------------------------------------------------------
// 情感节点设计方法论
// ---------------------------------------------------------------------------

function buildEmotionalPacingMethod(): string {
  return `## 情感节点设计

关系发展（友情、爱情、从属）必须经过事件驱动的节点递进：

1. **设计3-5个关键事件**：共同御敌、秘密分享、利益冲突、信任考验、牺牲/妥协
2. **递进升温**：每个事件推进关系一个层级，禁止跨越式发展（初见即死忠、一面之缘即深情）
3. **情绪用场景传达**：环境烘托（暴雨中独坐）+ 微动作（攥拳指尖发白）替代直白抒情
4. **情感与题材匹配**：末世侧重"共患难的信任"、悬疑侧重"试探与默契"、玄幻侧重"利益捆绑到真正认可"
5. **禁止标签化互动**：不可突然称兄道弟、莫名深情告白，每次称呼变化都需要事件支撑`;
}

// ---------------------------------------------------------------------------
// 代入感具体技法
// ---------------------------------------------------------------------------

function buildImmersionTechniques(): string {
  return `## 代入感技法

- **自然信息交代**：角色身份/外貌/背景通过行动和对话带出，禁止"资料卡式"直接罗列
- **画面代入法**：开场先给画面（动作、环境、声音），再给信息，让读者"看到"而非"被告知"
- **共鸣锚点**：主角的困境必须有普遍性（被欺压、不公待遇、被低估），让读者觉得"这也是我"
- **欲望钩子**：每章至少让读者产生一个"接下来会怎样"的好奇心
- **信息落差应用**：让读者比角色多知道一点（紧张感）或少知道一点（好奇心），动态切换`;
}

// ---------------------------------------------------------------------------
// Korean character psychology method (한국어 6단계 심리 분석)
// ---------------------------------------------------------------------------

function buildKoreanCharacterPsychologyMethod(): string {
  return `## 6단계 캐릭터 심리 분석

모든 주요 캐릭터의 핵심 장면 행동은 반드시 다음 6단계 추론을 거쳐야 합니다:

1. **현재 상황**: 캐릭터가 지금 어떤 국면에 처해 있는가? 손에 쥔 패는?
2. **핵심 동기**: 가장 원하는 것은? 가장 두려운 것은?
3. **정보 경계**: 무엇을 알고 있는가? 무엇을 모르는가? 상황에 대한 오판은?
4. **성격 필터**: 같은 국면에서 이 캐릭터의 성격이라면 어떻게 반응하는가? (충동적/신중한/음험한/과감한)
5. **행동 선택**: 위 네 가지를 근거로 어떤 선택을 내리는가?
6. **감정 외화**: 이 선택에 수반되는 감정은? 어떤 신체 언어, 표정, 어조로 표현되는가?

단계를 건너뛰고 행동만 쓰는 것은 금지입니다. 합리적 행동이 도출되지 않으면 전제 복선이 부족한 것이니, 먼저 복선을 보완하세요.`;
}

// ---------------------------------------------------------------------------
// Korean supporting character method (한국어 조연 설계 방법론)
// ---------------------------------------------------------------------------

function buildKoreanSupportingCharacterMethod(): string {
  return `## 조연 설계 방법론

### 조연 B면 원칙
조연에게는 반격이 있어야 하고, 자기만의 셈법이 있어야 합니다. 주인공의 강함은 똑똑한 상대를 제압하는 데서 나오지, 바보를 짓밟는 데서 나오지 않습니다.

### 구축 방법
1. **동기를 메인 라인에 결부**: 모든 조연의 행동 동기는 메인 스토리와 연결
   - 빌런이 주인공에 맞서는 이유는 "빌런이니까"가 아니라, 자신만의 절박함(가족 보호, 생존 자원 쟁탈 등)
   - 아군이 주인공을 돕는 이유는 공동의 적이 있거나 빚이 있기 때문이지, 무조건적 충성이 아닙니다
2. **핵심 태그 + 반전 디테일**: 조연을 살아 있게 만들기
   - 겉으로 냉정한 캐릭터에게 알려지지 않은 따뜻한 면(예: 몰래 유기동물 돌보기)
   - 투박해 보이는 캐릭터에게 의외의 섬세한 취미
   - 악역 두목이 어머니 앞에서는 고분고분
3. **사건으로 인물을 세우기**: 외모 묘사와 형용사 나열로 캐릭터를 세우는 것은 금지. 사건 속 반응, 선택, 어조로 성격을 보여주세요
4. **언어 구분도**: 캐릭터마다 말투가 구별 가능해야 합니다 — 어휘 습관, 문장 길이, 입버릇, 사투리 흔적 모두 도구입니다
5. **집단 반응 금지**: 군중 장면에서 "모두 놀랐다"가 아닌, 1-2명의 구체적 반응을 선택해서 씁니다`;
}

// ---------------------------------------------------------------------------
// Korean reader psychology method (한국어 독자 심리학 프레임워크)
// ---------------------------------------------------------------------------

function buildKoreanReaderPsychologyMethod(): string {
  return `## 독자 심리학 프레임워크

집필 시 독자의 심리 상태를 동시에 고려합니다:

- **기대감 관리**: 독자가 해소를 기대할 때 적절히 지연시켜 쾌감을 키우고, 인내심이 바닥나기 직전에 즉시 피드백을 줍니다
- **정보 격차**: 독자가 캐릭터보다 조금 더 알게 하거나(긴장감), 조금 덜 알게 하여(호기심) 동적으로 전환합니다
- **감정 박자**: 억압 → 해소 → 더 큰 억압 → 더 큰 해소. 해소 시 독자의 심리적 기대치를 초과해야 합니다
- **앵커링 효과**: 먼저 기준점을 제시하고(상대가 얼마나 강한지/난이도가 얼마나 높은지), 그 다음 주인공의 퍼포먼스를 보여줍니다
- **매몰 비용**: 독자가 이미 투자한 독서 시간이 리텐션의 핵심. 매 화마다 "계속 읽을 이유"를 줍니다
- **몰입감 유지**: 주인공의 곤경은 독자가 공감할 수 있어야 하고, 주인공의 선택은 "나라도 그랬을 것"이라 느끼게 해야 합니다`;
}

// ---------------------------------------------------------------------------
// Korean emotional pacing method (한국어 감정 노드 설계)
// ---------------------------------------------------------------------------

function buildKoreanEmotionalPacingMethod(): string {
  return `## 감정 노드 설계

관계 발전(우정, 사랑, 종속)은 반드시 사건 구동형 노드를 단계적으로 거쳐야 합니다:

1. **3-5개 핵심 이벤트 설계**: 공동 방어, 비밀 공유, 이해관계 충돌, 신뢰 시험, 희생/타협
2. **점진적 관계 발전**: 각 이벤트가 관계를 한 단계씩 밀어올립니다. 비약적 발전 금지(첫 만남에 죽음을 불사하는 충성, 한 번 본 사이에 깊은 사랑)
3. **감정은 장면으로 전달**: 환경 연출(폭우 속 홀로 앉아 있기) + 미세 동작(주먹을 쥐어 손끝이 하얘짐)으로 직접적 감정 서술을 대체
4. **감정과 장르 매칭**: 아포칼립스는 "함께 고난을 겪으며 쌓는 신뢰", 미스터리는 "탐색과 암묵적 교감", 판타지는 "이해관계 결합에서 진심 인정으로"
5. **라벨식 상호작용 금지**: 갑자기 형제를 맺거나, 뜬금없이 고백하는 것은 불가. 호칭 변화 하나에도 사건적 근거가 필요`;
}

// ---------------------------------------------------------------------------
// Korean immersion techniques (한국어 몰입감 기법)
// ---------------------------------------------------------------------------

function buildKoreanImmersionTechniques(): string {
  return `## 몰입감 기법

- **자연스러운 정보 전달**: 캐릭터의 신원/외모/배경은 행동과 대화 속에 녹여서 전달. "신상카드식" 나열 금지
- **화면 대입법**: 장면 도입부에 먼저 화면(동작, 환경, 소리)을 주고, 그 다음 정보를 줍니다. 독자가 "보는" 것이지 "듣는" 것이 아닙니다
- **공감 앵커**: 주인공의 곤경에 보편성(억압, 부당한 대우, 과소평가)을 부여하여 "이건 나 이야기이기도 하다"고 느끼게 합니다
- **욕망 갈고리**: 매 화에서 최소 하나의 "그 다음에 어떻게 될까?" 호기심을 심어야 합니다
- **정보 격차 활용**: 독자가 캐릭터보다 조금 더 알게 하거나(긴장감) 조금 덜 알게 하여(호기심) 동적으로 전환합니다`;
}

// ---------------------------------------------------------------------------
// Korean golden chapters rules (한국어 황금 3화)
// ---------------------------------------------------------------------------

function buildKoreanGoldenChaptersRules(chapterNumber?: number): string {
  if (chapterNumber === undefined || chapterNumber > 3) return "";

  const chapterRules: Record<number, string> = {
    1: `### 제1화: 핵심 갈등 던지기
- 첫 장면부터 갈등에 직입. 배경 설명이나 세계관 소개로 시작하는 것 금지
- 첫 문단에 반드시 동작 또는 대화. 독자가 "보는" 화면
- 도입 장면 제한: 최대 1-2개 장면, 최대 3명의 캐릭터
- 주인공의 신원/외모/배경은 행동 속에서 자연스럽게 전달. 신상카드 나열 금지
- 이 화가 끝나기 전에 핵심 갈등이 수면 위로
- 한 줄 대사로 전달할 수 있는 정보를 한 문단 서술로 쓰지 않기`,

    2: `### 제2화: 치트키/핵심 능력 공개
- 주인공의 핵심 우위(치트키/특수 능력/정보 격차 등)가 이 화에서 첫 등장
- 치트키는 구체적 사건을 통해 보여줘야 하며, 내면 독백("나는 XX를 얻었다")만으로는 불가
- "주인공이 왜 다른가"에 대한 독자 인식 구축 시작
- 첫 소규모 쾌감 포인트가 이 화에서 터져야 함
- 핵심 갈등 계속 조이기, 새 서브플롯 도입 금지`,

    3: `### 제3화: 단기 목표 확립
- 주인공의 첫 단계적 목표가 이 화에서 확립
- 목표는 구체적이고 측정 가능해야 함(누군가를 이기기/무언가를 획득하기/어딘가에 도달하기). 추상적인 "강해지기"는 불가
- 이 화를 읽고 나면 독자가 "다음에 주인공이 뭘 하는지" 말할 수 있어야 함
- 화 말미 클리프행어를 최대한 강하게. 이 화가 독자의 추독 여부를 결정하는 핵심 화`,
  };

  return `## 황금 3화 특별 지침 (현재 제${chapterNumber}화)

도입 3화가 독자의 추독 여부를 결정합니다. 다음 강제 규칙을 따르세요:

- 첫 벽돌부터 쌓지 마세요 — 건물이 폭발하는 장면부터 시작하세요
- 정보 폭격 금지: 세계관, 힘의 체계 등의 설정은 스토리 진행에 따라 자연스럽게 공개
- 매 화 1개의 스토리 라인에 집중, 등장인물 3명 이내
- 강한 감정 우선: 독자의 공감(가족 유대, 부당한 대우, 과소평가)을 활용해 빠르게 몰입감 구축

${chapterRules[chapterNumber] ?? ""}`;
}

// ---------------------------------------------------------------------------
// Korean full cast tracking (한국어 전원 추적)
// ---------------------------------------------------------------------------

function buildKoreanFullCastTracking(): string {
  return `## 전원 추적

이 작품은 전원 추적 모드를 사용합니다. 매 화 종료 시 POST_SETTLEMENT에 다음을 추가로 포함해야 합니다:
- 이번 화 등장 캐릭터 목록 (이름 + 한 줄 상태 변화)
- 캐릭터 간 관계 변동 (있을 경우)
- 미등장이나 언급된 캐릭터 (이름 + 언급 사유)`;
}

// ---------------------------------------------------------------------------
// Korean pre-write checklist (한국어 집필 전 체크리스트)
// ---------------------------------------------------------------------------

function buildKoreanPreWriteChecklist(book: BookConfig, gp: GenreProfile): string {
  let idx = 1;
  const lines = [
    "## 집필 전 반드시 자문할 것",
    "",
    `${idx++}. 【개요 앵커링】이번 화는 권별 개요의 어떤 노드/단계에 해당하는가? 이번 화에서 해당 노드의 스토리를 반드시 전진시켜야 하며, 건너뛰거나 후속 노드를 미리 소비해서는 안 된다. 개요에 화 범위가 지정되어 있으면 리듬을 엄격히 따른다.`,
    `${idx++}. 주인공의 현 시점 이익 극대화 선택은?`,
    `${idx++}. 이 갈등에서 누가 먼저 움직이며, 왜 반드시 그래야 하는가?`,
    `${idx++}. 조연/빌런에게 명확한 욕구, 두려움, 반격 수단이 있는가? 행동이 "과거 경험 + 현재 이해관계 + 성격 기저"로 구동되는가?`,
    `${idx++}. 빌런이 현재 파악한 정보는? 독자만 아는 정보는? 메타 지식 사용은 없는가?`,
    `${idx++}. 화 말미에 클리프행어(서스펜스/복선/갈등 에스컬레이션)를 남겼는가?`,
  ];

  if (gp.numericalSystem) {
    lines.push(`${idx++}. 이번 화의 성과가 구체적 자원, 수치 증감, 지위 변화, 또는 회수된 복선으로 귀결되는가?`);
  }

  lines.push(
    `${idx++}. 【분량 늘리기 검사】이번 화에 갈등 없는 일상 나열이 있는가? 있다면 인과관계나 강한 감정으로 개조`,
    `${idx++}. 【메인 라인 이탈 검사】이번 화가 메인 스토리 목표를 전진시키는가? 서브플롯이 2-3화 내에 핵심 목표와 연결되는가?`,
    `${idx++}. 【쾌감 리듬 검사】최근 3-5화 내에 소규모 쾌감 포인트가 있었는가? 독자의 "감정 갭"이 축적 중인가, 해소 중인가?`,
    `${idx++}. 【인물 붕괴 검사】캐릭터 행동이 기존 성격 태그와 일치하는가? 복선 없는 돌발 변화는 없는가?`,
    `${idx++}. 【시점 검사】이번 화의 시점이 명확한가? 같은 장면에서 발화 인물이 3명 이내로 통제되는가?`,
    `${idx++}. 위 질문 중 답하지 못하는 것이 있으면, 먼저 논리 체인을 보완한 뒤 본문을 작성한다`,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 黄金三章（前3章特殊指令）
// ---------------------------------------------------------------------------

function buildGoldenChaptersRules(chapterNumber?: number): string {
  if (chapterNumber === undefined || chapterNumber > 3) return "";

  const chapterRules: Record<number, string> = {
    1: `### 第一章：抛出核心冲突
- 开篇直接进入冲突场景，禁止用背景介绍/世界观设定开头
- 第一段必须有动作或对话，让读者"看到"画面
- 开篇场景限制：最多1-2个场景，最多3个角色
- 主角身份/外貌/背景通过行动自然带出，禁止资料卡式罗列
- 本章结束前，核心矛盾必须浮出水面
- 一句对话能交代的信息不要用一段叙述，角色身份、性格、地位都可以从一句有特色的台词中带出`,

    2: `### 第二章：展现金手指/核心能力
- 主角的核心优势（金手指/特殊能力/信息差等）必须在本章初现
- 金手指的展现必须通过具体事件，不能只是内心独白"我获得了XX"
- 开始建立"主角有什么不同"的读者认知
- 第一个小爽点应在本章出现
- 继续收紧核心冲突，不引入新支线`,

    3: `### 第三章：明确短期目标
- 主角的第一个阶段性目标必须在本章确立
- 目标必须具体可衡量（打败某人/获得某物/到达某处），不能是抽象的"变强"
- 读完本章，读者应能说出"接下来主角要干什么"
- 章尾钩子要足够强，这是读者决定是否继续追读的关键章`,
  };

  return `## 黄金三章特殊指令（当前第${chapterNumber}章）

开篇三章决定读者是否追读。遵循以下强制规则：

- 开篇不要从第一块砖头开始砌楼——从炸了一栋楼开始写
- 禁止信息轰炸：世界观、力量体系等设定随剧情自然揭示
- 每章聚焦1条故事线，人物数量控制在3个以内
- 强情绪优先：利用读者共情（亲情纽带、不公待遇、被低估）快速建立代入感

${chapterRules[chapterNumber] ?? ""}`;
}

// ---------------------------------------------------------------------------
// Full cast tracking (conditional)
// ---------------------------------------------------------------------------

function buildFullCastTracking(): string {
  return `## 全员追踪

本书启用全员追踪模式。每章结束时，POST_SETTLEMENT 必须额外包含：
- 本章出场角色清单（名字 + 一句话状态变化）
- 角色间关系变动（如有）
- 未出场但被提及的角色（名字 + 提及原因）`;
}

// ---------------------------------------------------------------------------
// Genre-specific rules
// ---------------------------------------------------------------------------

function buildGenreRules(gp: GenreProfile, genreBody: string): string {
  const fatigueLine = gp.fatigueWords.length > 0
    ? `- 高疲劳词（${gp.fatigueWords.join("、")}）单章最多出现1次`
    : "";

  const chapterTypesLine = gp.chapterTypes.length > 0
    ? `动笔前先判断本章类型：\n${gp.chapterTypes.map(t => `- ${t}`).join("\n")}`
    : "";

  const pacingLine = gp.pacingRule
    ? `- 节奏规则：${gp.pacingRule}`
    : "";

  return [
    `## 题材规范（${gp.name}）`,
    fatigueLine,
    pacingLine,
    chapterTypesLine,
    genreBody,
  ].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Protagonist rules from book_rules
// ---------------------------------------------------------------------------

function buildProtagonistRules(bookRules: BookRules | null): string {
  if (!bookRules?.protagonist) return "";

  const p = bookRules.protagonist;
  const lines = [`## 主角铁律（${p.name}）`];

  if (p.personalityLock.length > 0) {
    lines.push(`\n性格锁定：${p.personalityLock.join("、")}`);
  }
  if (p.behavioralConstraints.length > 0) {
    lines.push("\n行为约束：");
    for (const c of p.behavioralConstraints) {
      lines.push(`- ${c}`);
    }
  }

  if (bookRules.prohibitions.length > 0) {
    lines.push("\n本书禁忌：");
    for (const p of bookRules.prohibitions) {
      lines.push(`- ${p}`);
    }
  }

  if (bookRules.genreLock?.forbidden && bookRules.genreLock.forbidden.length > 0) {
    lines.push(`\n风格禁区：禁止出现${bookRules.genreLock.forbidden.join("、")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Book rules body (user-written markdown)
// ---------------------------------------------------------------------------

function buildBookRulesBody(body: string): string {
  if (!body) return "";
  return `## 本书专属规则\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Style guide
// ---------------------------------------------------------------------------

function buildStyleGuide(styleGuide: string): string {
  if (!styleGuide || styleGuide === "(文件尚未创建)") return "";
  return `## 文风指南\n\n${styleGuide}`;
}

// ---------------------------------------------------------------------------
// Style fingerprint (Phase 9: C3)
// ---------------------------------------------------------------------------

function buildStyleFingerprint(fingerprint?: string): string {
  if (!fingerprint) return "";
  return `## 文风指纹（模仿目标）

以下是从参考文本中提取的写作风格特征。你的输出必须尽量贴合这些特征：

${fingerprint}`;
}

// ---------------------------------------------------------------------------
// Pre-write checklist
// ---------------------------------------------------------------------------

function buildPreWriteChecklist(book: BookConfig, gp: GenreProfile): string {
  let idx = 1;
  const lines = [
    "## 动笔前必须自问",
    "",
    `${idx++}. 【大纲锚定】本章对应卷纲中的哪个节点/阶段？本章必须推进该节点的剧情，不得跳过或提前消耗后续节点。如果卷纲指定了章节范围，严格遵守节奏。`,
    `${idx++}. 主角此刻利益最大化的选择是什么？`,
    `${idx++}. 这场冲突是谁先动手，为什么非做不可？`,
    `${idx++}. 配角/反派是否有明确诉求、恐惧和反制？行为是否由"过往经历+当前利益+性格底色"驱动？`,
    `${idx++}. 反派当前掌握了哪些已知信息？哪些信息只有读者知道？有无信息越界？`,
    `${idx++}. 章尾是否留了钩子（悬念/伏笔/冲突升级）？`,
  ];

  if (gp.numericalSystem) {
    lines.push(`${idx++}. 本章收益能否落到具体资源、数值增量、地位变化或已回收伏笔？`);
  }

  // 17雷点精华预防
  lines.push(
    `${idx++}. 【流水账检查】本章是否有无冲突的日常流水叙述？如有，加入前因后果或强情绪改造`,
    `${idx++}. 【主线偏离检查】本章是否推进了主线目标？支线是否在2-3章内与核心目标关联？`,
    `${idx++}. 【爽点节奏检查】最近3-5章内是否有小爽点落地？读者的"情绪缺口"是否在积累或释放？`,
    `${idx++}. 【人设崩塌检查】角色行为是否与已建立的性格标签一致？有无无铺垫的突然转变？`,
    `${idx++}. 【视角检查】本章视角是否清晰？同场景内说话人物是否控制在3人以内？`,
    `${idx++}. 如果任何问题答不上来，先补逻辑链，再写正文`,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Creative-only output format (no settlement blocks)
// ---------------------------------------------------------------------------

function buildCreativeOutputFormat(book: BookConfig, gp: GenreProfile, lengthSpec: LengthSpec): string {
  const resourceRow = gp.numericalSystem
    ? "| 当前资源总量 | X | 与账本一致 |\n| 本章预计增量 | +X（来源） | 无增量写+0 |"
    : "";

  const preWriteTable = `=== PRE_WRITE_CHECK ===
（必须输出Markdown表格）
| 检查项 | 本章记录 | 备注 |
|--------|----------|------|
| 大纲锚定 | 当前卷名/阶段 + 本章应推进的具体节点 | 严禁跳过节点或提前消耗后续剧情 |
| 上下文范围 | 第X章至第Y章 / 状态卡 / 设定文件 | |
| 当前锚点 | 地点 / 对手 / 收益目标 | 锚点必须具体 |
${resourceRow}| 待回收伏笔 | 用真实 hook_id 填写（无则写 none） | 与伏笔池一致 |
| 本章冲突 | 一句话概括 | |
| 章节类型 | ${gp.chapterTypes.join("/")} | |
| 风险扫描 | OOC/信息越界/设定冲突${gp.powerScaling ? "/战力崩坏" : ""}/节奏/词汇疲劳 | |`;

  return `## 输出格式（严格遵守）

${preWriteTable}

=== CHAPTER_TITLE ===
(章节标题，不含"第X章"。标题必须与已有章节标题不同，不要重复使用相同或相似的标题；若提供了 recent title history 或高频标题词，必须主动避开重复词根和高频意象)

=== CHAPTER_CONTENT ===
(正文内容，目标${lengthSpec.target}字，允许区间${lengthSpec.softMin}-${lengthSpec.softMax}字)

【重要】本次只需输出以上三个区块（PRE_WRITE_CHECK、CHAPTER_TITLE、CHAPTER_CONTENT）。
状态卡、伏笔池、摘要等追踪文件将由后续结算阶段处理，请勿输出。`;
}

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

function buildOutputFormat(book: BookConfig, gp: GenreProfile, lengthSpec: LengthSpec): string {
  const resourceRow = gp.numericalSystem
    ? "| 当前资源总量 | X | 与账本一致 |\n| 本章预计增量 | +X（来源） | 无增量写+0 |"
    : "";

  const preWriteTable = `=== PRE_WRITE_CHECK ===
（必须输出Markdown表格）
| 检查项 | 本章记录 | 备注 |
|--------|----------|------|
| 大纲锚定 | 当前卷名/阶段 + 本章应推进的具体节点 | 严禁跳过节点或提前消耗后续剧情 |
| 上下文范围 | 第X章至第Y章 / 状态卡 / 设定文件 | |
| 当前锚点 | 地点 / 对手 / 收益目标 | 锚点必须具体 |
${resourceRow}| 待回收伏笔 | 用真实 hook_id 填写（无则写 none） | 与伏笔池一致 |
| 本章冲突 | 一句话概括 | |
| 章节类型 | ${gp.chapterTypes.join("/")} | |
| 风险扫描 | OOC/信息越界/设定冲突${gp.powerScaling ? "/战力崩坏" : ""}/节奏/词汇疲劳 | |`;

  const postSettlement = gp.numericalSystem
    ? `=== POST_SETTLEMENT ===
（如有数值变动，必须输出Markdown表格）
| 结算项 | 本章记录 | 备注 |
|--------|----------|------|
| 资源账本 | 期初X / 增量+Y / 期末Z | 无增量写+0 |
| 重要资源 | 资源名 -> 贡献+Y（依据） | 无写"无" |
| 伏笔变动 | 新增/回收/延后 Hook | 同步更新伏笔池 |`
    : `=== POST_SETTLEMENT ===
（如有伏笔变动，必须输出）
| 结算项 | 本章记录 | 备注 |
|--------|----------|------|
| 伏笔变动 | 新增/回收/延后 Hook | 同步更新伏笔池 |`;

  const updatedLedger = gp.numericalSystem
    ? `\n=== UPDATED_LEDGER ===\n(更新后的完整资源账本，Markdown表格格式)`
    : "";

  return `## 输出格式（严格遵守）

${preWriteTable}

=== CHAPTER_TITLE ===
(章节标题，不含"第X章"。标题必须与已有章节标题不同，不要重复使用相同或相似的标题；若提供了 recent title history 或高频标题词，必须主动避开重复词根和高频意象)

=== CHAPTER_CONTENT ===
(正文内容，目标${lengthSpec.target}字，允许区间${lengthSpec.softMin}-${lengthSpec.softMax}字)

${postSettlement}

=== UPDATED_STATE ===
(更新后的完整状态卡，Markdown表格格式)
${updatedLedger}
=== UPDATED_HOOKS ===
(更新后的完整伏笔池，Markdown表格格式)

=== CHAPTER_SUMMARY ===
(本章摘要，Markdown表格格式，必须包含以下列)
| 章节 | 标题 | 出场人物 | 关键事件 | 状态变化 | 伏笔动态 | 情绪基调 | 章节类型 |
|------|------|----------|----------|----------|----------|----------|----------|
| N | 本章标题 | 角色1,角色2 | 一句话概括 | 关键变化 | H01埋设/H02推进 | 情绪走向 | ${gp.chapterTypes.length > 0 ? gp.chapterTypes.join("/") : "过渡/冲突/高潮/收束"} |

=== UPDATED_SUBPLOTS ===
(更新后的完整支线进度板，Markdown表格格式)
| 支线ID | 支线名 | 相关角色 | 起始章 | 最近活跃章 | 距今章数 | 状态 | 进度概述 | 回收ETA |
|--------|--------|----------|--------|------------|----------|------|----------|---------|

=== UPDATED_EMOTIONAL_ARCS ===
(更新后的完整情感弧线，Markdown表格格式)
| 角色 | 章节 | 情绪状态 | 触发事件 | 强度(1-10) | 弧线方向 |
|------|------|----------|----------|------------|----------|

=== UPDATED_CHARACTER_MATRIX ===
(更新后的角色交互矩阵，分三个子表)

### 角色档案
| 角色 | 核心标签 | 反差细节 | 说话风格 | 性格底色 | 与主角关系 | 核心动机 | 当前目标 |
|------|----------|----------|----------|----------|------------|----------|----------|

### 相遇记录
| 角色A | 角色B | 首次相遇章 | 最近交互章 | 关系性质 | 关系变化 |
|-------|-------|------------|------------|----------|----------|

### 信息边界
| 角色 | 已知信息 | 未知信息 | 信息来源章 |
|------|----------|----------|------------|`;
}

// ---------------------------------------------------------------------------
// Korean creative output format (한국어 크리에이티브 전용 출력 포맷)
// ---------------------------------------------------------------------------

function buildKoreanCreativeOutputFormat(book: BookConfig, gp: GenreProfile, lengthSpec: LengthSpec): string {
  const resourceRow = gp.numericalSystem
    ? "| 현재 자원 총량 | X | 장부와 일치 |\n| 이번 화 예상 증감 | +X (출처) | 증감 없으면 +0 |"
    : "";

  const preWriteTable = `=== PRE_WRITE_CHECK ===
(반드시 Markdown 표 형식으로 출력)
| 점검 항목 | 이번 화 기록 | 비고 |
|-----------|-------------|------|
| 개요 앵커링 | 현재 권명/단계 + 이번 화에서 전진시킬 구체적 노드 | 노드 건너뛰기 및 후속 스토리 조기 소비 엄금 |
| 컨텍스트 범위 | 제X화~제Y화 / 상태 카드 / 설정 파일 | |
| 현재 앵커 포인트 | 장소 / 상대 / 수확 목표 | 앵커는 반드시 구체적 |
${resourceRow}| 회수 대기 복선 | 실제 hook_id 기입 (없으면 none) | 복선 풀과 일치 |
| 이번 화 갈등 | 한 줄 요약 | |
| 화 유형 | ${gp.chapterTypes.join("/")} | |
| 리스크 스캔 | OOC/메타 지식 사용/설정 충돌${gp.powerScaling ? "/전투력 붕괴" : ""}/리듬/어휘 피로 | |`;

  return `## 출력 포맷 (엄격 준수)

${preWriteTable}

=== CHAPTER_TITLE ===
(화 제목. "제X화" 미포함. 기존 화 제목과 중복 금지. recent title history나 고빈도 제목 키워드가 제공되면 반복 어근 및 고빈도 이미지를 반드시 회피)

=== CHAPTER_CONTENT ===
(본문 내용, 목표 ${lengthSpec.target}자, 허용 범위 ${lengthSpec.softMin}-${lengthSpec.softMax}자, 공백 포함)

【중요】이번에는 위 세 개 블록(PRE_WRITE_CHECK, CHAPTER_TITLE, CHAPTER_CONTENT)만 출력하세요.
상태 카드, 복선 풀, 요약 등 추적 파일은 후속 정산 단계에서 처리되므로 출력하지 마세요.`;
}

// ---------------------------------------------------------------------------
// Korean output format (한국어 출력 포맷)
// ---------------------------------------------------------------------------

function buildKoreanOutputFormat(book: BookConfig, gp: GenreProfile, lengthSpec: LengthSpec): string {
  const resourceRow = gp.numericalSystem
    ? "| 현재 자원 총량 | X | 장부와 일치 |\n| 이번 화 예상 증감 | +X (출처) | 증감 없으면 +0 |"
    : "";

  const preWriteTable = `=== PRE_WRITE_CHECK ===
(반드시 Markdown 표 형식으로 출력)
| 점검 항목 | 이번 화 기록 | 비고 |
|-----------|-------------|------|
| 개요 앵커링 | 현재 권명/단계 + 이번 화에서 전진시킬 구체적 노드 | 노드 건너뛰기 및 후속 스토리 조기 소비 엄금 |
| 컨텍스트 범위 | 제X화~제Y화 / 상태 카드 / 설정 파일 | |
| 현재 앵커 포인트 | 장소 / 상대 / 수확 목표 | 앵커는 반드시 구체적 |
${resourceRow}| 회수 대기 복선 | 실제 hook_id 기입 (없으면 none) | 복선 풀과 일치 |
| 이번 화 갈등 | 한 줄 요약 | |
| 화 유형 | ${gp.chapterTypes.join("/")} | |
| 리스크 스캔 | OOC/메타 지식 사용/설정 충돌${gp.powerScaling ? "/전투력 붕괴" : ""}/리듬/어휘 피로 | |`;

  const postSettlement = gp.numericalSystem
    ? `=== POST_SETTLEMENT ===
(수치 변동 시 반드시 Markdown 표 출력)
| 정산 항목 | 이번 화 기록 | 비고 |
|-----------|-------------|------|
| 자원 장부 | 기초 X / 증감 +Y / 기말 Z | 증감 없으면 +0 |
| 주요 자원 | 자원명 -> 기여 +Y (근거) | 없으면 "없음" |
| 복선 변동 | 신규/회수/연기 Hook | 복선 풀 동기화 |`
    : `=== POST_SETTLEMENT ===
(복선 변동 시 반드시 출력)
| 정산 항목 | 이번 화 기록 | 비고 |
|-----------|-------------|------|
| 복선 변동 | 신규/회수/연기 Hook | 복선 풀 동기화 |`;

  const updatedLedger = gp.numericalSystem
    ? `\n=== UPDATED_LEDGER ===\n(갱신된 전체 자원 장부, Markdown 표 형식)`
    : "";

  return `## 출력 포맷 (엄격 준수)

${preWriteTable}

=== CHAPTER_TITLE ===
(화 제목. "제X화" 미포함. 기존 화 제목과 중복 금지. recent title history나 고빈도 제목 키워드가 제공되면 반복 어근 및 고빈도 이미지를 반드시 회피)

=== CHAPTER_CONTENT ===
(본문 내용, 목표 ${lengthSpec.target}자, 허용 범위 ${lengthSpec.softMin}-${lengthSpec.softMax}자, 공백 포함)

${postSettlement}

=== UPDATED_STATE ===
(갱신된 전체 상태 카드, Markdown 표 형식)
${updatedLedger}
=== UPDATED_HOOKS ===
(갱신된 전체 복선 풀, Markdown 표 형식)

=== CHAPTER_SUMMARY ===
(이번 화 요약, Markdown 표 형식, 반드시 아래 열을 포함)
| 화 | 제목 | 등장인물 | 핵심 사건 | 상태 변화 | 복선 동향 | 감정 기조 | 화 유형 |
|----|------|----------|-----------|-----------|-----------|-----------|---------|
| N | 이번 화 제목 | 캐릭터1, 캐릭터2 | 한 줄 요약 | 핵심 변화 | H01 매설/H02 진행 | 감정 흐름 | ${gp.chapterTypes.length > 0 ? gp.chapterTypes.join("/") : "전환/갈등/클라이맥스/마무리"} |

=== UPDATED_SUBPLOTS ===
(갱신된 전체 서브플롯 진행판, Markdown 표 형식)
| 서브플롯ID | 서브플롯명 | 관련 캐릭터 | 시작 화 | 최근 활성 화 | 경과 화수 | 상태 | 진행 요약 | 회수 ETA |
|------------|-----------|------------|---------|-------------|----------|------|----------|---------|

=== UPDATED_EMOTIONAL_ARCS ===
(갱신된 전체 감정 아크, Markdown 표 형식)
| 캐릭터 | 화 | 감정 상태 | 트리거 이벤트 | 강도(1-10) | 아크 방향 |
|--------|-----|----------|-------------|------------|----------|

=== UPDATED_CHARACTER_MATRIX ===
(갱신된 캐릭터 상호작용 매트릭스, 세 개 하위표)

### 캐릭터 프로필
| 캐릭터 | 핵심 태그 | 반전 디테일 | 말투 스타일 | 성격 기저 | 주인공과의 관계 | 핵심 동기 | 현재 목표 |
|--------|----------|-----------|-----------|----------|--------------|----------|----------|

### 조우 기록
| 캐릭터A | 캐릭터B | 첫 만남 화 | 최근 상호작용 화 | 관계 성격 | 관계 변화 |
|---------|---------|-----------|----------------|----------|----------|

### 정보 경계
| 캐릭터 | 파악한 정보 | 모르는 정보 | 정보 출처 화 |
|--------|-----------|-----------|------------|`;
}
