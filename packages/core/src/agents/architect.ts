import { BaseAgent } from "./base.js";
import type { BookConfig, FanficMode } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import { readGenreProfile } from "./rules-reader.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { renderHookSnapshot } from "../utils/memory-retrieval.js";

export interface ArchitectOutput {
  readonly storyBible: string;
  readonly volumeOutline: string;
  readonly bookRules: string;
  readonly currentState: string;
  readonly pendingHooks: string;
}

export class ArchitectAgent extends BaseAgent {
  get name(): string {
    return "architect";
  }

  async generateFoundation(
    book: BookConfig,
    externalContext?: string,
    reviewFeedback?: string,
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const resolvedLanguage = book.language ?? gp.language;

    const contextBlock = externalContext
      ? `\n\n## 外部指令\n以下是来自外部系统的创作指令，请将其融入设定中：\n\n${externalContext}\n`
      : "";
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, resolvedLanguage);

    const numericalBlock = gp.numericalSystem
      ? (resolvedLanguage === "ko"
        ? `- 명확한 수치/자원 체계 추적 가능\n- book_rules에 numericalSystemOverrides(hardCap, resourceTypes) 정의`
        : `- 有明确的数值/资源体系可追踪\n- 在 book_rules 中定义 numericalSystemOverrides（hardCap、resourceTypes）`)
      : (resolvedLanguage === "ko"
        ? "- 본 장르는 수치 시스템 없음, 자원 장부 불필요"
        : "- 本题材无数值系统，不需要资源账本");

    const powerBlock = gp.powerScaling
      ? (resolvedLanguage === "ko" ? "- 명확한 전투력 등급 체계 존재" : "- 有明确的战力等级体系")
      : "";

    const eraBlock = gp.eraResearch
      ? (resolvedLanguage === "ko" ? "- 시대 고증 필요 (book_rules에 eraConstraints 설정)" : "- 需要年代考据支撑（在 book_rules 中设置 eraConstraints）")
      : "";

    const storyBiblePrompt = resolvedLanguage === "en"
      ? `Use structured second-level headings:
## 01_Worldview
World setting, historical-social frame, and core rules

## 02_Protagonist
Protagonist setup (identity / advantage / personality core / behavioral boundaries)

## 03_Factions_and_Characters
Major factions and important supporting characters (for each: name, identity, motivation, relationship to protagonist, independent goal)

## 04_Geography_and_Environment
Map / scene design and environmental traits

## 05_Title_and_Blurb
Title method:
- Keep the title clear, direct, and easy to understand
- Use a format that immediately signals genre and core appeal
- Avoid overly literary or misleading titles

Blurb method (within 300 words, choose one):
1. Open with conflict, then reveal the hook, then leave suspense
2. Summarize only the main line and keep a clear suspense gap
3. Use a miniature scene that captures the book's strongest pull

Core blurb principle:
- The blurb is product copy that must make readers want to click`
      : resolvedLanguage === "ko"
        ? `구조화된 2차 제목으로 구성하세요:
## 01_세계관
세계관 설정, 핵심 규칙 체계

## 02_주인공
주인공 설정 (정체성/치트키/성격 기조/행동 경계)

## 03_세력과_인물
세력 분포, 주요 조연 (각각: 이름, 정체, 동기, 주인공과의 관계, 독립적 목표)
- 한국식 호칭 체계 반영: 형/누나/오빠/언니·선배/후배 등 관계 기반 호칭

## 04_지리와_환경
지도/장면 설정, 환경 특색

## 05_제목과_소개
제목 방법론:
- 제목은 간결하고 직관적이어야 하며, 독자가 보자마자 장르와 주제를 파악할 수 있어야 합니다
- "장르+핵심 쾌감+주인공 행동" 형식의 제목 활용, 지나치게 문학적인 제목 지양
- 플랫폼 트렌드 키워드를 반영하여 정확한 독자층 유입

소개 방법론 (300자 이내, 세 가지 중 택일):
1. 갈등 도입법: 첫 문장에 위기/갈등 제시, 두 번째 문장에 치트키/핵심 능력, 세 번째 문장에 서스펜스
2. 핵심 요약법: 본선만 골라서 요약(전체 줄거리 아님), 반드시 서스펜스 유지
3. 미니 시나리오법: 이야기에서 가장 매력적인 장면을 도입부로 활용

소개 핵심 원칙:
- 소개 = 상품 카피, 독자가 "클릭해서 읽고 싶다"는 충동을 느끼게 해야 합니다
- 스토리 설정, 캐릭터, 또는 인상적인 장면에서 진입 가능
- 반드시 훅이 있어야 합니다 (예: "노트에 적힌 이름의 주인은, 결국 모두 죽는다")`
        : `用结构化二级标题组织：
## 01_世界观
世界观设定、核心规则体系

## 02_主角
主角设定（身份/金手指/性格底色/行为边界）

## 03_势力与人物
势力分布、重要配角（每人：名字、身份、动机、与主角关系、独立目标）

## 04_地理与环境
地图/场景设定、环境特色

## 05_书名与简介
书名方法论：
- 书名必须简单扼要、通俗易懂，读者看到书名就能知道题材和主题
- 采用"题材+核心爽点+主角行为"的长书名格式，避免文艺化
- 融入平台当下热点词汇，吸引精准流量
- 禁止题材错位（都市文取玄幻书名会导致读者流失）
- 参考热榜书名风格：俏皮、通俗、有记忆点

简介方法论（300字内，三种写法任选其一）：
1. 冲突开篇法：第一句抛困境/冲突，第二句亮金手指/核心能力，第三句留悬念
2. 高度概括法：只挑主线概括（不是全篇概括），必须留悬念
3. 小剧场法：提炼故事中最经典的桥段，作为引子

简介核心原则：
- 简介 = 产品宣传语，必须让读者产生"我要点开看"的冲动
- 可以从剧情设定、人设、或某个精彩片段切入
- 必须有噱头（如"凡是被写在笔记本上的名字，最后都得死"）`;

    const volumeOutlinePrompt = resolvedLanguage === "en"
      ? `Volume plan. For each volume include: title, chapter range, core conflict, key turning points, and payoff goal

### Golden First Three Chapters Rule
- Chapter 1: throw the core conflict immediately; no large background dump
- Chapter 2: show the core edge / ability / leverage that answers Chapter 1's pressure
- Chapter 3: establish the first concrete short-term goal that gives readers a reason to continue`
      : resolvedLanguage === "ko"
        ? `볼륨 아웃라인 기획. 각 볼륨에 포함: 볼륨명, 회차 범위, 핵심 갈등, 주요 전환점, 수확 목표

### 황금 3화 법칙 (첫 3화 필수 준수)
- 1화: 핵심 갈등을 즉시 던질 것 (주인공이 곧바로 위기/선택에 직면), 장황한 배경 설명 금지
- 2화: 치트키/핵심 능력 공개 (1화의 압박에 주인공이 어떻게 대응하는지), 독자에게 카타르시스 예고
- 3화: 단기 목표 확립 (주인공의 첫 번째 구체적이고 달성 가능한 목표), 독자에게 다음 화 넘김 이유 제공

### 한국 웹소설 회차 구성 원칙
- 각 회차 끝에 클리프행어 배치 (다음 화 유입율 극대화)
- 짧은 문단(1-2문장) 리듬으로 템포 설계
- "~했다" 종결어미 반복 지양, 다양한 어미 활용`
        : `卷纲规划，每卷包含：卷名、章节范围、核心冲突、关键转折、收益目标

### 黄金三章法则（前三章必须遵循）
- 第1章：抛出核心冲突（主角立即面临困境/危机/选择），禁止大段背景灌输
- 第2章：展示金手指/核心能力（主角如何应对第1章的困境），让读者看到爽点预期
- 第3章：明确短期目标（主角确立第一个具体可达成的目标），给读者追读理由`;

    const bookRulesPrompt = resolvedLanguage === "en"
      ? `Generate book_rules.md as YAML frontmatter plus narrative guidance:
\`\`\`
---
version: "1.0"
protagonist:
  name: (protagonist name)
  personalityLock: [(3-5 personality keywords)]
  behavioralConstraints: [(3-5 behavioral constraints)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3 forbidden style intrusions)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (decide from the setting)
  resourceTypes: [(core resource types)]` : ""}
prohibitions:
  - (3-5 book-specific prohibitions)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## Narrative Perspective
(Describe the narrative perspective and style)

## Core Conflict Driver
(Describe the book's core conflict and propulsion)
\`\`\``
      : resolvedLanguage === "ko"
        ? `book_rules.md를 YAML frontmatter + 서사 가이드 형식으로 생성하세요:
\`\`\`
---
version: "1.0"
protagonist:
  name: (주인공 이름)
  personalityLock: [(3-5개 성격 키워드)]
  behavioralConstraints: [(3-5개 행동 제약)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3종 혼입 금지 문체)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (설정에 따라 결정)
  resourceTypes: [(핵심 자원 유형 목록)]` : ""}
prohibitions:
  - (3-5개 본 작품 금기)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## 서사 시점
(본 작품의 서사 시점과 문체를 기술하세요)
- 존댓말/반말 기조 명시 (인물별 어미 체계)

## 핵심 갈등 동력
(본 작품의 핵심 모순과 추진력을 기술하세요)

## 한국 웹소설 문체 규칙
- 짧은 문단 (1-2문장) 리듬 유지
- "~했다" 종결어미 반복 지양, 다양한 어미 활용 (-ㄴ다/-더라/-였다/-는데 등)
- 클리프행어 기법: 각 회차 마지막에 서스펜스 배치
- 호칭 체계: 형/누나/오빠/언니·선배/후배 등 관계 기반 호칭 자연스럽게 사용
\`\`\``
        : `生成 book_rules.md 格式的 YAML frontmatter + 叙事指导，包含：
\`\`\`
---
version: "1.0"
protagonist:
  name: (主角名)
  personalityLock: [(3-5个性格关键词)]
  behavioralConstraints: [(3-5条行为约束)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3种禁止混入的文风)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (根据设定确定)
  resourceTypes: [(核心资源类型列表)]` : ""}
prohibitions:
  - (3-5条本书禁忌)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## 叙事视角
(描述本书叙事视角和风格)

## 核心冲突驱动
(描述本书的核心矛盾和驱动力)
\`\`\``;

    const currentStatePrompt = resolvedLanguage === "en"
      ? `Initial state card (Chapter 0), include:
| Field | Value |
| --- | --- |
| Current Chapter | 0 |
| Current Location | (starting location) |
| Protagonist State | (initial condition) |
| Current Goal | (first goal) |
| Current Constraint | (initial constraint) |
| Current Alliances | (initial relationships) |
| Current Conflict | (first conflict) |`
      : resolvedLanguage === "ko"
        ? `초기 상태 카드 (0화), 포함:
| 필드 | 값 |
|------|-----|
| 현재 회차 | 0 |
| 현재 위치 | (시작 장소) |
| 주인공 상태 | (초기 상태) |
| 현재 목표 | (첫 번째 목표) |
| 현재 제약 | (초기 제약) |
| 현재 적아 관계 | (초기 관계) |
| 현재 갈등 | (첫 번째 갈등) |`
        : `初始状态卡（第0章），包含：
| 字段 | 值 |
|------|-----|
| 当前章节 | 0 |
| 当前位置 | (起始地点) |
| 主角状态 | (初始状态) |
| 当前目标 | (第一个目标) |
| 当前限制 | (初始限制) |
| 当前敌我 | (初始关系) |
| 当前冲突 | (第一个冲突) |`;

    const pendingHooksPrompt = resolvedLanguage === "en"
      ? `Initial hook pool (Markdown table):
| hook_id | start_chapter | type | status | last_advanced_chapter | expected_payoff | payoff_timing | notes |

Rules for the hook table:
- Column 5 must be a pure chapter number, never natural-language description
- During book creation, all planned hooks are still unapplied, so last_advanced_chapter = 0
- Column 7 must be one of: immediate / near-term / mid-arc / slow-burn / endgame
- If you want to describe the initial clue/signal, put it in notes instead of column 5`
      : resolvedLanguage === "ko"
        ? `초기 복선 풀 (Markdown 표):
| hook_id | 시작 회차 | 유형 | 상태 | 최근 진전 | 예상 회수 | 회수 리듬 | 비고 |

복선 표 규칙:
- 5열은 반드시 순수 회차 번호여야 하며, 자연어 설명 불가
- 작품 생성 단계에서 모든 복선은 아직 정식 진전이 없으므로 5열은 일괄 0
- 7열은 반드시 다음 중 하나: immediate / near-term / mid-arc / slow-burn / endgame
- "최초 단서/최초 신호"를 설명하려면 비고에 작성하고 5열에 쓰지 마세요`
        : `初始伏笔池（Markdown表格）：
| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 备注 |

伏笔表规则：
- 第5列必须是纯数字章节号，不能写自然语言描述
- 建书阶段所有伏笔都还没正式推进，所以第5列统一填 0
- 第7列必须填写：立即 / 近期 / 中程 / 慢烧 / 终局 之一
- 如果要说明"初始线索/最初信号"，写进备注，不要写进第5列`;

    const finalRequirementsPrompt = resolvedLanguage === "en"
      ? `Generated content must:
1. Fit the ${book.platform} platform taste
2. Fit the ${gp.name} genre traits
${numericalBlock}
${powerBlock}
${eraBlock}
3. Give the protagonist a clear personality and behavioral boundaries
4. Keep hooks and payoffs coherent
5. Make supporting characters independently motivated rather than pure tools`
      : resolvedLanguage === "ko"
        ? `생성된 콘텐츠 필수 요건:
1. ${book.platform} 플랫폼 취향에 부합할 것
2. ${gp.name} 장르 특성에 부합할 것
${numericalBlock}
${powerBlock}
${eraBlock}
3. 주인공 캐릭터가 선명하고 명확한 행동 경계를 가질 것
4. 복선이 전후로 호응하며 미회수 복선을 남기지 않을 것
5. 조연에게 독립적 동기를 부여하고 도구적 인물로 만들지 않을 것
6. 존댓말/반말 체계가 인물 관계에 일관되게 설계될 것
7. 한국식 호칭(형/누나/오빠/언니/선배/후배 등)이 자연스럽게 반영될 것`
        : `生成内容必须：
1. 符合${book.platform}平台口味
2. 符合${gp.name}题材特征
${numericalBlock}
${powerBlock}
${eraBlock}
3. 主角人设鲜明，有明确行为边界
4. 伏笔前后呼应，不留悬空线
5. 配角有独立动机，不是工具人`;

    const systemIntro = resolvedLanguage === "ko"
      ? `당신은 전문 웹소설 아키텍트입니다. 새로운 ${gp.name} 소설의 완전한 기초 설정을 생성하는 것이 당신의 임무입니다.${contextBlock}${reviewFeedbackBlock}

요건:
- 플랫폼: ${book.platform}
- 장르: ${gp.name} (${book.genre})
- 목표 회차 수: ${book.targetChapters}화
- 회차당 글자 수: ${book.chapterWordCount}자`
      : `你是一个专业的网络小说架构师。你的任务是为一本新的${gp.name}小说生成完整的基础设定。${contextBlock}${reviewFeedbackBlock}

要求：
- 平台：${book.platform}
- 题材：${gp.name}（${book.genre}）
- 目标章数：${book.targetChapters}章
- 每章字数：${book.chapterWordCount}字`;

    const genreHeader = resolvedLanguage === "ko" ? "## 장르 특성" : "## 题材特征";
    const genReqHeader = resolvedLanguage === "ko" ? "## 생성 요건" : "## 生成要求";
    const genReqDesc = resolvedLanguage === "ko"
      ? "다음 내용을 생성하세요. 각 파트는 === SECTION: <name> === 으로 구분합니다:"
      : "你需要生成以下内容，每个部分用 === SECTION: <name> === 分隔：";

    const systemPrompt = `${systemIntro}

${genreHeader}

${genreBody}

${genReqHeader}

${genReqDesc}

=== SECTION: story_bible ===
${storyBiblePrompt}

=== SECTION: volume_outline ===
${volumeOutlinePrompt}

=== SECTION: book_rules ===
${bookRulesPrompt}

=== SECTION: current_state ===
${currentStatePrompt}

=== SECTION: pending_hooks ===
${pendingHooksPrompt}

${finalRequirementsPrompt}`;

    const langPrefix = resolvedLanguage === "en"
      ? `【LANGUAGE OVERRIDE】ALL output (story_bible, volume_outline, book_rules, current_state, pending_hooks) MUST be written in English. Character names, place names, and all prose must be in English. The === SECTION: === tags remain unchanged.\n\n`
      : resolvedLanguage === "ko"
        ? `【언어 설정】모든 출력(story_bible, volume_outline, book_rules, current_state, pending_hooks)은 반드시 한국어로 작성하세요. 인물명, 지명, 모든 산문은 한국어로 작성합니다. === SECTION: === 태그는 그대로 유지합니다.\n\n`
        : "";
    const userMessage = resolvedLanguage === "en"
      ? `Generate the complete foundation for a ${gp.name} novel titled "${book.title}". Write everything in English.`
      : resolvedLanguage === "ko"
        ? `"${book.title}" 제목의 ${gp.name} 소설을 위한 완전한 기초 설정을 생성하세요.`
        : `请为标题为"${book.title}"的${gp.name}小说生成完整基础设定。`;

    const response = await this.chat([
      { role: "system", content: langPrefix + systemPrompt },
      { role: "user", content: userMessage },
    ], { maxTokens: 16384, temperature: 0.8 });

    return this.parseSections(response.content);
  }

  async writeFoundationFiles(
    bookDir: string,
    output: ArchitectOutput,
    numericalSystem: boolean = true,
    language: "zh" | "en" | "ko" = "zh",
  ): Promise<void> {
    const storyDir = join(bookDir, "story");
    await mkdir(storyDir, { recursive: true });

    const writes: Array<Promise<void>> = [
      writeFile(join(storyDir, "story_bible.md"), output.storyBible, "utf-8"),
      writeFile(join(storyDir, "volume_outline.md"), output.volumeOutline, "utf-8"),
      writeFile(join(storyDir, "book_rules.md"), output.bookRules, "utf-8"),
      writeFile(join(storyDir, "current_state.md"), output.currentState, "utf-8"),
      writeFile(join(storyDir, "pending_hooks.md"), output.pendingHooks, "utf-8"),
    ];

    if (numericalSystem) {
      const ledgerContent = language === "en"
        ? "# Resource Ledger\n\n| Chapter | Opening Value | Source | Integrity | Delta | Closing Value | Evidence |\n| --- | --- | --- | --- | --- | --- | --- |\n| 0 | 0 | Initialization | - | 0 | 0 | Initial book state |\n"
        : language === "ko"
          ? "# 자원 장부\n\n| 회차 | 기초값 | 출처 | 완전성 | 증감 | 기말값 | 근거 |\n|------|--------|------|--------|------|--------|------|\n| 0 | 0 | 초기화 | - | 0 | 0 | 작품 초기 상태 |\n"
          : "# 资源账本\n\n| 章节 | 期初值 | 来源 | 完整度 | 增量 | 期末值 | 依据 |\n|------|--------|------|--------|------|--------|------|\n| 0 | 0 | 初始化 | - | 0 | 0 | 开书初始 |\n";
      writes.push(
        writeFile(join(storyDir, "particle_ledger.md"), ledgerContent, "utf-8"),
      );
    }

    // Initialize new truth files
    const subplotContent = language === "en"
      ? "# Subplot Board\n\n| Subplot ID | Subplot | Related Characters | Start Chapter | Last Active Chapter | Chapters Since | Status | Progress Summary | Payoff ETA |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
      : language === "ko"
        ? "# 서브플롯 진행판\n\n| 서브플롯 ID | 서브플롯명 | 관련 인물 | 시작 회차 | 최근 활성 회차 | 경과 회차 | 상태 | 진행 요약 | 회수 ETA |\n|------------|-----------|----------|----------|-------------|----------|------|---------|--------|\n"
        : "# 支线进度板\n\n| 支线ID | 支线名 | 相关角色 | 起始章 | 最近活跃章 | 距今章数 | 状态 | 进度概述 | 回收ETA |\n|--------|--------|----------|--------|------------|----------|------|----------|---------|\n";

    const emotionalContent = language === "en"
      ? "# Emotional Arcs\n\n| Character | Chapter | Emotional State | Trigger Event | Intensity (1-10) | Arc Direction |\n| --- | --- | --- | --- | --- | --- |\n"
      : language === "ko"
        ? "# 감정선\n\n| 인물 | 회차 | 감정 상태 | 촉발 사건 | 강도(1-10) | 감정선 방향 |\n|------|------|----------|----------|-----------|----------|\n"
        : "# 情感弧线\n\n| 角色 | 章节 | 情绪状态 | 触发事件 | 强度(1-10) | 弧线方向 |\n|------|------|----------|----------|------------|----------|\n";

    const matrixContent = language === "en"
      ? "# Character Matrix\n\n### Character Profiles\n| Character | Core Tags | Contrast Detail | Speech Style | Personality Core | Relationship to Protagonist | Core Motivation | Current Goal |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n\n### Encounter Log\n| Character A | Character B | First Meeting Chapter | Latest Interaction Chapter | Relationship Type | Relationship Change |\n| --- | --- | --- | --- | --- | --- |\n\n### Information Boundaries\n| Character | Known Information | Unknown Information | Source Chapter |\n| --- | --- | --- | --- |\n"
      : language === "ko"
        ? "# 인물 관계 매트릭스\n\n### 인물 프로필\n| 인물 | 핵심 태그 | 반전 디테일 | 말투 | 성격 기조 | 주인공과의 관계 | 핵심 동기 | 현재 목표 |\n|------|----------|-----------|------|----------|--------------|----------|----------|\n\n### 만남 기록\n| 인물A | 인물B | 첫 만남 회차 | 최근 상호작용 회차 | 관계 유형 | 관계 변화 |\n|-------|-------|-----------|----------------|----------|----------|\n\n### 정보 경계\n| 인물 | 인지 정보 | 미인지 정보 | 정보 출처 회차 |\n|------|----------|-----------|------------|\n"
        : "# 角色交互矩阵\n\n### 角色档案\n| 角色 | 核心标签 | 反差细节 | 说话风格 | 性格底色 | 与主角关系 | 核心动机 | 当前目标 |\n|------|----------|----------|----------|----------|------------|----------|----------|\n\n### 相遇记录\n| 角色A | 角色B | 首次相遇章 | 最近交互章 | 关系性质 | 关系变化 |\n|-------|-------|------------|------------|----------|----------|\n\n### 信息边界\n| 角色 | 已知信息 | 未知信息 | 信息来源章 |\n|------|----------|----------|------------|\n";

    writes.push(
      writeFile(join(storyDir, "subplot_board.md"), subplotContent, "utf-8"),
      writeFile(join(storyDir, "emotional_arcs.md"), emotionalContent, "utf-8"),
      writeFile(join(storyDir, "character_matrix.md"), matrixContent, "utf-8"),
    );

    await Promise.all(writes);
  }

  /**
   * Reverse-engineer foundation from existing chapters.
   * Reads all chapters as a single text block and asks LLM to extract story_bible,
   * volume_outline, book_rules, current_state, and pending_hooks.
   */
  async generateFoundationFromImport(
    book: BookConfig,
    chaptersText: string,
    externalContext?: string,
    reviewFeedback?: string,
    options?: { readonly importMode?: "continuation" | "series" },
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const resolvedLanguage = book.language ?? gp.language;
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, resolvedLanguage);

    const contextBlock = externalContext
      ? (resolvedLanguage === "en"
          ? `\n\n## External Instructions\n${externalContext}\n`
          : resolvedLanguage === "ko"
            ? `\n\n## 외부 지시\n${externalContext}\n`
            : `\n\n## 外部指令\n${externalContext}\n`)
      : "";

    const numericalBlock = gp.numericalSystem
      ? (resolvedLanguage === "en"
          ? `- The story uses a trackable numerical/resource system
- Define numericalSystemOverrides in book_rules (hardCap, resourceTypes)`
          : resolvedLanguage === "ko"
            ? `- 추적 가능한 수치/자원 체계가 있습니다
- book_rules에 numericalSystemOverrides (hardCap, resourceTypes)를 정의하세요`
            : `- 有明确的数值/资源体系可追踪
- 在 book_rules 中定义 numericalSystemOverrides（hardCap、resourceTypes）`)
      : (resolvedLanguage === "en"
          ? "- This genre has no explicit numerical system and does not need a resource ledger"
          : resolvedLanguage === "ko"
            ? "- 본 장르에는 명시적 수치 시스템이 없으며, 자원 장부가 필요 없습니다"
            : "- 本题材无数值系统，不需要资源账本");

    const powerBlock = gp.powerScaling
      ? (resolvedLanguage === "en" ? "- The story has an explicit power-scaling ladder"
        : resolvedLanguage === "ko" ? "- 명확한 전투력 등급 체계가 있습니다"
          : "- 有明确的战力等级体系")
      : "";

    const eraBlock = gp.eraResearch
      ? (resolvedLanguage === "en"
          ? "- The story needs era/historical grounding (set eraConstraints in book_rules)"
          : resolvedLanguage === "ko"
            ? "- 시대/역사적 근거가 필요합니다 (book_rules에 eraConstraints 설정)"
            : "- 需要年代考据支撑（在 book_rules 中设置 eraConstraints）")
      : "";

    const storyBiblePrompt = resolvedLanguage === "en"
      ? `Extract from the source text and organize with structured second-level headings:
## 01_Worldview
Extracted world setting, core rules, and frame

## 02_Protagonist
Inferred protagonist setup (identity / advantage / personality core / behavioral boundaries)

## 03_Factions_and_Characters
Factions and important supporting characters that appear in the source text

## 04_Geography_and_Environment
Locations, environments, and scene traits drawn from the source text

## 05_Title_and_Blurb
Keep the original title "${book.title}" and generate a matching blurb from the source text`
      : resolvedLanguage === "ko"
        ? `본문에서 추출하여 구조화된 2차 제목으로 구성하세요:
## 01_세계관
본문에서 추출한 세계관 설정, 핵심 규칙 체계

## 02_주인공
본문에서 추론한 주인공 설정 (정체성/치트키/성격 기조/행동 경계)

## 03_세력과_인물
본문에 등장하는 세력 분포, 주요 조연 (각각: 이름, 정체, 동기, 주인공과의 관계, 독립적 목표)

## 04_지리와_환경
본문에 등장하는 지도/장면 설정, 환경 특색

## 05_제목과_소개
원래 제목 "${book.title}"을 유지하고, 본문 내용에 기반한 소개를 생성하세요`
        : `从正文中提取，用结构化二级标题组织：
## 01_世界观
从正文中提取的世界观设定、核心规则体系

## 02_主角
从正文中推断的主角设定（身份/金手指/性格底色/行为边界）

## 03_势力与人物
从正文中出现的势力分布、重要配角（每人：名字、身份、动机、与主角关系、独立目标）

## 04_地理与环境
从正文中出现的地图/场景设定、环境特色

## 05_书名与简介
保留原书名"${book.title}"，根据正文内容生成简介`;

    const volumeOutlinePrompt = resolvedLanguage === "en"
      ? `Infer the volume plan from existing text:
- Existing chapters: review the actual structure already present
- Future projection: predict later directions from active hooks and plot momentum
For each volume include: title, chapter range, core conflict, and key turning points`
      : resolvedLanguage === "ko"
        ? `기존 본문에서 볼륨 아웃라인을 역추론하세요:
- 기존 회차: 실제 콘텐츠 기반으로 각 볼륨의 구조를 검토
- 향후 예측: 활성 복선과 스토리 모멘텀을 기반으로 미래 방향 예측
각 볼륨에 포함: 볼륨명, 회차 범위, 핵심 갈등, 주요 전환점`
        : `基于已有正文反推卷纲：
- 已有章节部分：根据实际内容回顾每卷的结构
- 后续预测部分：基于已有伏笔和剧情走向预测未来方向
每卷包含：卷名、章节范围、核心冲突、关键转折`;

    const bookRulesPrompt = resolvedLanguage === "en"
      ? `Infer book_rules.md as YAML frontmatter plus narrative guidance from character behavior in the source text:
\`\`\`
---
version: "1.0"
protagonist:
  name: (extract protagonist name from the text)
  personalityLock: [(infer 3-5 personality keywords from behavior)]
  behavioralConstraints: [(infer 3-5 behavioral constraints from behavior)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3 forbidden style intrusions)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (infer from the text)
  resourceTypes: [(extract core resource types from the text)]` : ""}
prohibitions:
  - (infer 3-5 book-specific prohibitions from the text)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## Narrative Perspective
(Infer the narrative perspective and style from the text)

## Core Conflict Driver
(Infer the book's core conflict and propulsion from the text)
\`\`\``
      : resolvedLanguage === "ko"
        ? `본문의 인물 행동에서 book_rules.md를 YAML frontmatter + 서사 가이드 형식으로 역추론하세요:
\`\`\`
---
version: "1.0"
protagonist:
  name: (본문에서 주인공 이름 추출)
  personalityLock: [(행동에서 3-5개 성격 키워드 추론)]
  behavioralConstraints: [(행동에서 3-5개 행동 제약 추론)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3종 혼입 금지 문체)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (본문에서 추론)
  resourceTypes: [(본문에서 핵심 자원 유형 추출)]` : ""}
prohibitions:
  - (본문에서 3-5개 본 작품 금기 추론)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## 서사 시점
(본문에서 서사 시점과 문체를 추론하세요)
- 존댓말/반말 기조 명시 (인물별 어미 체계)

## 핵심 갈등 동력
(본문에서 핵심 모순과 추진력을 추론하세요)
\`\`\``
        : `从正文中角色行为反推 book_rules.md 格式的 YAML frontmatter + 叙事指导：
\`\`\`
---
version: "1.0"
protagonist:
  name: (从正文提取主角名)
  personalityLock: [(从行为推断3-5个性格关键词)]
  behavioralConstraints: [(从行为推断3-5条行为约束)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3种禁止混入的文风)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (从正文推断)
  resourceTypes: [(从正文提取核心资源类型)]` : ""}
prohibitions:
  - (从正文推断3-5条本书禁忌)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## 叙事视角
(从正文推断本书叙事视角和风格)

## 核心冲突驱动
(从正文推断本书的核心矛盾和驱动力)
\`\`\``;

    const currentStatePrompt = resolvedLanguage === "en"
      ? `Reflect the state at the end of the latest chapter:
| Field | Value |
| --- | --- |
| Current Chapter | (latest chapter number) |
| Current Location | (location at the end of the latest chapter) |
| Protagonist State | (state at the end of the latest chapter) |
| Current Goal | (current goal) |
| Current Constraint | (current constraint) |
| Current Alliances | (current alliances / opposition) |
| Current Conflict | (current conflict) |`
      : resolvedLanguage === "ko"
        ? `마지막 회차 종료 시점의 상태를 반영하세요:
| 필드 | 값 |
|------|-----|
| 현재 회차 | (마지막 회차 번호) |
| 현재 위치 | (마지막 회차 종료 시 위치) |
| 주인공 상태 | (마지막 회차 종료 시 상태) |
| 현재 목표 | (현재 목표) |
| 현재 제약 | (현재 제약) |
| 현재 적아 관계 | (현재 적아 관계) |
| 현재 갈등 | (현재 갈등) |`
        : `反映最后一章结束时的状态卡：
| 字段 | 值 |
|------|-----|
| 当前章节 | (最后一章章节号) |
| 当前位置 | (最后一章结束时的位置) |
| 主角状态 | (最后一章结束时的状态) |
| 当前目标 | (当前目标) |
| 当前限制 | (当前限制) |
| 当前敌我 | (当前敌我关系) |
| 当前冲突 | (当前冲突) |`;

    const pendingHooksPrompt = resolvedLanguage === "en"
      ? `Identify all active hooks from the source text (Markdown table):
| hook_id | start_chapter | type | status | latest_progress | expected_payoff | payoff_timing | notes |`
      : resolvedLanguage === "ko"
        ? `본문에서 모든 활성 복선을 식별하세요 (Markdown 표):
| hook_id | 시작 회차 | 유형 | 상태 | 최근 진전 | 예상 회수 | 회수 리듬 | 비고 |`
        : `从正文中识别的所有伏笔（Markdown表格）：
| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 备注 |`;

    const keyPrinciplesPrompt = resolvedLanguage === "en"
      ? `## Key Principles

1. Derive everything from the source text; do not invent unsupported settings
2. Hook extraction must be complete: unresolved clues, hints, and foreshadowing all count
3. Character inference must come from dialogue and behavior, not assumption
4. Accuracy first; detailed is better than missing crucial information
${numericalBlock}
${powerBlock}
${eraBlock}`
      : resolvedLanguage === "ko"
        ? `## 핵심 원칙

1. 모든 것을 본문에서 도출하세요. 본문에 없는 설정을 임의로 만들지 마세요
2. 복선 식별은 완전해야 합니다: 미해결 단서, 암시, 예고 모두 포함
3. 인물 추론은 대화와 행동에 기반해야 하며, 추측하지 마세요
4. 정확성 우선, 핵심 정보를 누락하느니 상세하게 기록하세요
${numericalBlock}
${powerBlock}
${eraBlock}`
        : `## 关键原则

1. 一切从正文出发，不要臆造正文中没有的设定
2. 伏笔识别要完整：悬而未决的线索、暗示、预告都算
3. 角色推断要准确：从对话和行为推断性格，不要想当然
4. 准确性优先，宁可详细也不要遗漏
${numericalBlock}
${powerBlock}
${eraBlock}`;

    const isSeries = options?.importMode === "series";
    const continuationDirectiveEn = isSeries
      ? `## Continuation Direction Requirements (Critical)
The continuation portion (chapters in volume_outline that have not happened yet) must open up **new narrative space**:
1. **New conflict dimension**: Do not merely stretch the imported conflict longer. Introduce at least one new conflict vector not yet covered by the source text (new character, new faction, new location, or new time horizon)
2. **Ignite within 5 chapters**: The first continuation volume must establish a fresh suspense engine within 5 chapters. Do not spend 3 chapters recapping known information
3. **Scene freshness**: At least 50% of key continuation scenes must happen in locations or situations not already used in the imported chapters
4. **No repeated meeting rooms**: If the imported chapters end on a meeting/discussion beat, the continuation must restart from action instead of opening another meeting`
      : `## Continuation Direction
The volume_outline should naturally extend the existing narrative arc. Continue from where the imported chapters left off — advance existing conflicts, pay off planted hooks, and introduce new complications that arise organically from the current situation. Do not recap known information.`;
    const continuationDirectiveKo = isSeries
      ? `## 속편 방향 요건 (핵심)
속편 부분(volume_outline에서 아직 발생하지 않은 회차)은 **새로운 서사 공간**을 설계해야 합니다:
1. **새 갈등 차원**: 가져온 회차의 갈등을 단순히 늘리지 마세요. 원문이 다루지 않은 새 갈등 벡터를 최소 1개 도입하세요 (새 인물, 새 세력, 새 장소, 새 시간 범위)
2. **5화 내 점화**: 속편 첫 볼륨은 5화 이내에 새 서스펜스 엔진을 구축해야 합니다. 기존 정보 요약에 3화를 쓰지 마세요
3. **장면 신선도**: 속편 핵심 장면의 최소 50%는 가져온 회차에서 사용되지 않은 장소나 상황에서 발생해야 합니다
4. **회의실 반복 금지**: 가져온 회차가 회의/토론으로 끝났다면, 속편은 행동으로 시작해야 하며 또 다른 회의를 열지 마세요`
      : `## 속편 방향
볼륨 아웃라인은 기존 서사를 자연스럽게 이어가야 합니다. 가져온 회차가 끝난 지점에서 이어가세요 — 기존 갈등을 진전시키고, 설치한 복선을 회수하고, 현재 상황에서 유기적으로 발생하는 새 변수를 도입하세요. 기존 정보를 다시 요약하지 마세요.`;
    const continuationDirectiveZh = isSeries
      ? `## 续写方向要求（关键）
续写部分（volume_outline 中尚未发生的章节）必须设计**新的叙事空间**：
1. **新冲突维度**：续写不能只是把导入章节的冲突继续拉长。必须引入至少一个原文未涉及的新冲突方向（新角色、新势力、新地点、新时间跨度）
2. **5章内引爆**：续写的第一卷必须在前5章内建立新悬念，不允许用3章回顾已知信息
3. **场景新鲜度**：续写部分至少50%的关键场景发生在导入章节未出现的地点或情境中
4. **不重复会议**：如果导入章节以会议/讨论结束，续写必须从行动开始，不能再开一轮会`
      : `## 续写方向
卷纲应自然延续已有叙事弧线。从导入章节的结尾处接续——推进现有冲突、兑现已埋伏笔、引入从当前局势中有机产生的新变数。不要回顾已知信息。`;

    const workingModeEn = isSeries
      ? `## Working Mode

This is not a zero-to-one foundation pass. You must extract durable story truth from the imported chapters **and design a continuation path**. You need to:
1. Extract worldbuilding, factions, characters, and systems from the source text -> generate story_bible
2. Infer narrative structure and future arc direction -> generate volume_outline (review existing chapters + design a **new continuation direction**)
3. Infer protagonist lock, prohibitions, and narrative constraints from character behavior -> generate book_rules
4. Reflect the latest chapter state -> generate current_state
5. Extract all active hooks already planted in the text -> generate pending_hooks`
      : `## Working Mode

This is not a zero-to-one foundation pass. You must extract durable story truth from the imported chapters **and preserve a clean continuation path**. You need to:
1. Extract worldbuilding, factions, characters, and systems from the source text -> generate story_bible
2. Infer narrative structure and near-future arc direction -> generate volume_outline (review existing chapters + continue naturally from where the imported chapters stop)
3. Infer protagonist lock, prohibitions, and narrative constraints from character behavior -> generate book_rules
4. Reflect the latest chapter state -> generate current_state
5. Extract all active hooks already planted in the text -> generate pending_hooks`;
    const workingModeKo = isSeries
      ? `## 작업 모드

이것은 제로에서 만드는 것이 아니라, 기존 본문에서 추출하고 추론하여 **속편 방향을 설계**하는 작업입니다. 수행할 작업:
1. 본문에서 세계관, 세력, 인물, 능력 체계를 추출 -> story_bible 생성
2. 서사 구조에서 볼륨 아웃라인을 추론 -> volume_outline 생성 (기존 회차 검토 + **속편 부분의 새 방향 설계**)
3. 인물 행동에서 주인공 잠금과 금기를 추론 -> book_rules 생성
4. 최신 회차 상태에서 current_state 추론 (마지막 회차 종료 시점의 상태 반영)
5. 본문에서 설치된 복선을 식별 -> pending_hooks 생성`
      : `## 작업 모드

이것은 제로에서 만드는 것이 아니라, 기존 본문에서 추출하고 추론하여 **자연스러운 이어쓰기를 위한 명확한 연속 경로를 유지**하는 작업입니다. 수행할 작업:
1. 본문에서 세계관, 세력, 인물, 능력 체계를 추출 -> story_bible 생성
2. 서사 구조에서 볼륨 아웃라인을 추론 -> volume_outline 생성 (기존 회차 검토 후 가져온 회차 종료 지점에서 자연스럽게 이어감)
3. 인물 행동에서 주인공 잠금과 금기를 추론 -> book_rules 생성
4. 최신 회차 상태에서 current_state 추론 (마지막 회차 종료 시점의 상태 반영)
5. 본문에서 설치된 복선을 식별 -> pending_hooks 생성`;
    const workingModeZh = isSeries
      ? `## 工作模式

这不是从零创建，而是从已有正文中提取和推导，**并设计续写方向**。你需要：
1. 从正文中提取世界观、势力、角色、力量体系 → 生成 story_bible
2. 从叙事结构推断卷纲 → 生成 volume_outline（已有章节的回顾 + **续写部分的新方向设计**）
3. 从角色行为推断主角锁定和禁忌 → 生成 book_rules
4. 从最新章节状态推断 current_state（反映最后一章结束时的状态）
5. 从正文中识别已埋伏笔 → 生成 pending_hooks`
      : `## 工作模式

这不是从零创建，而是从已有正文中提取和推导，**并为自然续写保留清晰延续路径**。你需要：
1. 从正文中提取世界观、势力、角色、力量体系 → 生成 story_bible
2. 从叙事结构推断卷纲 → 生成 volume_outline（回顾已有章节，并从导入章节结束处自然接续）
3. 从角色行为推断主角锁定和禁忌 → 生成 book_rules
4. 从最新章节状态推断 current_state（反映最后一章结束时的状态）
5. 从正文中识别已埋伏笔 → 生成 pending_hooks`;

    const systemPrompt = resolvedLanguage === "en"
      ? `You are a professional web-fiction architect. Your task is to reverse-engineer a complete foundation from existing chapters.${contextBlock}

${workingModeEn}

All output sections — story_bible, volume_outline, book_rules, current_state, and pending_hooks — MUST be written in English. Keep the === SECTION: === tags unchanged.

${continuationDirectiveEn}
${reviewFeedbackBlock}
## Book Metadata

- Title: ${book.title}
- Platform: ${book.platform}
- Genre: ${gp.name} (${book.genre})
- Target Chapters: ${book.targetChapters}
- Chapter Target Length: ${book.chapterWordCount}

## Genre Profile

${genreBody}

## Output Contract

Generate the following sections. Separate every section with === SECTION: <name> ===:

=== SECTION: story_bible ===
${storyBiblePrompt}

=== SECTION: volume_outline ===
${volumeOutlinePrompt}

=== SECTION: book_rules ===
${bookRulesPrompt}

=== SECTION: current_state ===
${currentStatePrompt}

=== SECTION: pending_hooks ===
${pendingHooksPrompt}

${keyPrinciplesPrompt}`
      : resolvedLanguage === "ko"
        ? `당신은 전문 웹소설 아키텍트입니다. 기존 회차에서 완전한 기초 설정을 역추론하는 것이 당신의 임무입니다.${contextBlock}

${workingModeKo}

모든 출력 섹션 — story_bible, volume_outline, book_rules, current_state, pending_hooks — 은 반드시 한국어로 작성하세요. === SECTION: === 태그는 그대로 유지합니다.

${continuationDirectiveKo}
${reviewFeedbackBlock}
## 작품 정보

- 제목: ${book.title}
- 플랫폼: ${book.platform}
- 장르: ${gp.name} (${book.genre})
- 목표 회차 수: ${book.targetChapters}화
- 회차당 글자 수: ${book.chapterWordCount}자

## 장르 특성

${genreBody}

## 생성 요건

다음 내용을 생성하세요. 각 파트는 === SECTION: <name> === 으로 구분합니다:

=== SECTION: story_bible ===
${storyBiblePrompt}

=== SECTION: volume_outline ===
${volumeOutlinePrompt}

=== SECTION: book_rules ===
${bookRulesPrompt}

=== SECTION: current_state ===
${currentStatePrompt}

=== SECTION: pending_hooks ===
${pendingHooksPrompt}

${keyPrinciplesPrompt}`
        : `你是一个专业的网络小说架构师。你的任务是从已有的小说正文中反向推导完整的基础设定。${contextBlock}

${workingModeZh}

${continuationDirectiveZh}
${reviewFeedbackBlock}
## 书籍信息

- 标题：${book.title}
- 平台：${book.platform}
- 题材：${gp.name}（${book.genre}）
- 目标章数：${book.targetChapters}章
- 每章字数：${book.chapterWordCount}字

## 题材特征

${genreBody}

## 生成要求

你需要生成以下内容，每个部分用 === SECTION: <name> === 分隔：

=== SECTION: story_bible ===
${storyBiblePrompt}

=== SECTION: volume_outline ===
${volumeOutlinePrompt}

=== SECTION: book_rules ===
${bookRulesPrompt}

=== SECTION: current_state ===
${currentStatePrompt}

=== SECTION: pending_hooks ===
${pendingHooksPrompt}

${keyPrinciplesPrompt}`;
    const userMessage = resolvedLanguage === "en"
      ? `Generate the complete foundation for an imported ${gp.name} novel titled "${book.title}". Write everything in English.\n\n${chaptersText}`
      : resolvedLanguage === "ko"
        ? `다음은 "${book.title}"의 기존 전체 본문입니다. 여기서 완전한 기초 설정을 역추론하세요:\n\n${chaptersText}`
        : `以下是《${book.title}》的全部已有正文，请从中反向推导完整基础设定：\n\n${chaptersText}`;

    const response = await this.chat([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userMessage,
      },
    ], { maxTokens: 16384, temperature: 0.5 });

    return this.parseSections(response.content);
  }

  async generateFanficFoundation(
    book: BookConfig,
    fanficCanon: string,
    fanficMode: FanficMode,
    reviewFeedback?: string,
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, book.language ?? "zh");

    const MODE_INSTRUCTIONS: Record<FanficMode, string> = {
      canon: "剧情发生在原作空白期或未详述的角度。不可改变原作已确立的事实。",
      au: "标注AU设定与原作的关键分歧点，分歧后的世界线自由发展。保留角色核心性格。",
      ooc: "标注角色性格偏离的起点和驱动事件。偏离必须有逻辑驱动。",
      cp: "以配对角色的关系线为主线规划卷纲。每卷必须有关系推进节点。",
    };

    const systemPrompt = `你是一个专业的同人小说架构师。你的任务是基于原作正典为同人小说生成基础设定。

## 同人模式：${fanficMode}
${MODE_INSTRUCTIONS[fanficMode]}

## 新时空要求（关键）
你必须为这本同人设计一个**原创的叙事空间**，而不是复述原作剧情。具体要求：
1. **明确分岔点**：story_bible 必须标注"本作从原作的哪个节点分岔"，或"本作发生在原作未涉及的什么时空"
2. **独立核心冲突**：volume_outline 的核心冲突必须是原创的，不是原作情节的翻版。原作角色可以出现，但他们面对的是新问题
3. **5章内引爆**：volume_outline 的第1卷必须在前5章内建立核心悬念，不允许用3章做铺垫才到引爆点
4. **场景新鲜度**：至少50%的关键场景发生在原作未出现的地点或情境中

${reviewFeedbackBlock}

## 原作正典
${fanficCanon}

## 题材特征
${genreBody}

## 关键原则
1. **不发明主要角色** — 主要角色必须来自原作正典的角色档案
2. 可以添加原创配角，但必须在 story_bible 中标注为"原创角色"
3. story_bible 保留原作世界观，标注同人的改动/扩展部分，并明确写出**分岔点**和**新时空设定**
4. volume_outline 不得复述原作剧情节拍。每卷的核心事件必须是原创的，标注"原创"
5. book_rules 的 fanficMode 必须设为 "${fanficMode}"
6. 主角设定来自原作角色档案中的第一个角色（或用户在标题中暗示的角色）

你需要生成以下内容，每个部分用 === SECTION: <name> === 分隔：

=== SECTION: story_bible ===
世界观（基于原作正典）+ 角色列表（原作角色标注来源，原创角色标注"原创"）

=== SECTION: volume_outline ===
卷纲规划。每卷标注：卷名、章节范围、核心事件（标注原作/原创）、关系发展节点

=== SECTION: book_rules ===
\`\`\`
---
version: "1.0"
protagonist:
  name: (从原作角色中选择)
  personalityLock: [(从正典角色档案提取)]
  behavioralConstraints: [(基于原作行为模式)]
genreLock:
  primary: ${book.genre}
  forbidden: []
fanficMode: "${fanficMode}"
allowedDeviations: []
prohibitions:
  - (3-5条同人特有禁忌)
---
(叙事视角和风格指导)
\`\`\`

=== SECTION: current_state ===
初始状态卡（基于正典起始点）

=== SECTION: pending_hooks ===
初始伏笔池（从正典关键事件和关系中提取）`;

    const response = await this.chat([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `请为标题为"${book.title}"的${fanficMode}模式同人小说生成基础设定。目标${book.targetChapters}章，每章${book.chapterWordCount}字。`,
      },
    ], { maxTokens: 16384, temperature: 0.7 });

    return this.parseSections(response.content);
  }

  private buildReviewFeedbackBlock(
    reviewFeedback: string | undefined,
    language: "zh" | "en" | "ko",
  ): string {
    const trimmed = reviewFeedback?.trim();
    if (!trimmed) return "";

    if (language === "en") {
      return `\n\n## Previous Review Feedback
The previous foundation draft was rejected. You must explicitly fix the following issues in this regeneration instead of paraphrasing the same design:

${trimmed}\n`;
    }

    if (language === "ko") {
      return `\n\n## 이전 심사 피드백
이전 기초 설정 초안이 반려되었습니다. 이번 재생성에서 다음 문제들을 명확히 수정해야 합니다. 같은 설계를 단순히 표현만 바꿔 다시 작성하지 마세요:

${trimmed}\n`;
    }

    return `\n\n## 上一轮审核反馈
上一轮基础设定未通过审核。你必须在这次重生中明确修复以下问题，不能只换措辞重写同一套方案：

${trimmed}\n`;
  }

  private parseSections(content: string): ArchitectOutput {
    const parsedSections = new Map<string, string>();
    const sectionPattern = /^\s*===\s*SECTION\s*[：:]\s*([^\n=]+?)\s*===\s*$/gim;
    const matches = [...content.matchAll(sectionPattern)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!;
      const rawName = match[1] ?? "";
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[i + 1]?.index ?? content.length;
      const normalizedName = this.normalizeSectionName(rawName);
      parsedSections.set(normalizedName, content.slice(start, end).trim());
    }

    const extract = (name: string): string => {
      const section = parsedSections.get(this.normalizeSectionName(name));
      if (!section) {
        throw new Error(`Architect output missing required section: ${name}`);
      }
      if (name !== "pending_hooks") {
        return section;
      }
      return this.normalizePendingHooksSection(this.stripTrailingAssistantCoda(section));
    };

    return {
      storyBible: extract("story_bible"),
      volumeOutline: extract("volume_outline"),
      bookRules: extract("book_rules"),
      currentState: extract("current_state"),
      pendingHooks: extract("pending_hooks"),
    };
  }

  private normalizeSectionName(name: string): string {
    return name
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[`"'*_]/g, " ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private stripTrailingAssistantCoda(section: string): string {
    const lines = section.split("\n");
    const cutoff = lines.findIndex((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return /^(如果(?:你愿意|需要|想要|希望)|If (?:you(?:'d)? like|you want|needed)|I can (?:continue|next))/i.test(trimmed);
    });

    if (cutoff < 0) {
      return section;
    }

    return lines.slice(0, cutoff).join("\n").trimEnd();
  }

  private normalizePendingHooksSection(section: string): string {
    const rows = section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"))
      .filter((line) => !line.includes("---"))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
      .filter((cells) => cells.some(Boolean));

    if (rows.length === 0) {
      return section;
    }

    const dataRows = rows.filter((row) => (row[0] ?? "").toLowerCase() !== "hook_id");
    if (dataRows.length === 0) {
      return section;
    }

    const language: "zh" | "en" | "ko" = /[\uAC00-\uD7AF]/.test(section) ? "ko" : /[\u4e00-\u9fff]/.test(section) ? "zh" : "en";
    const normalizedHooks = dataRows.map((row, index) => {
      const rawProgress = row[4] ?? "";
      const normalizedProgress = this.parseHookChapterNumber(rawProgress);
      const seedNote = normalizedProgress === 0 && this.hasNarrativeProgress(rawProgress)
        ? (language === "zh" ? `初始线索：${rawProgress}` : language === "ko" ? `초기 신호: ${rawProgress}` : `initial signal: ${rawProgress}`)
        : "";
      const notes = this.mergeHookNotes(row[6] ?? "", seedNote, language);

      return {
        hookId: row[0] || `hook-${index + 1}`,
        startChapter: this.parseHookChapterNumber(row[1]),
        type: row[2] ?? "",
        status: row[3] ?? "open",
        lastAdvancedChapter: normalizedProgress,
        expectedPayoff: row[5] ?? "",
        payoffTiming: row.length >= 8 ? row[6] ?? "" : "",
        notes: row.length >= 8 ? this.mergeHookNotes(row[7] ?? "", seedNote, language) : notes,
      };
    });

    return renderHookSnapshot(normalizedHooks, language);
  }

  private parseHookChapterNumber(value: string | undefined): number {
    if (!value) return 0;
    const match = value.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  private hasNarrativeProgress(value: string | undefined): boolean {
    const normalized = (value ?? "").trim().toLowerCase();
    if (!normalized) return false;
    return !["0", "none", "n/a", "na", "-", "无", "未推进"].includes(normalized);
  }

  private mergeHookNotes(notes: string, seedNote: string, language: "zh" | "en" | "ko"): string {
    const trimmedNotes = notes.trim();
    const trimmedSeed = seedNote.trim();
    if (!trimmedSeed) {
      return trimmedNotes;
    }
    if (!trimmedNotes) {
      return trimmedSeed;
    }
    return language === "zh" || language === "ko"
      ? `${trimmedNotes}（${trimmedSeed}）`
      : `${trimmedNotes} (${trimmedSeed})`;
  }
}
