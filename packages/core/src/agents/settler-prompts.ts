import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import type { BookRules } from "../models/book-rules.js";

export function buildSettlerSystemPrompt(
  book: BookConfig,
  genreProfile: GenreProfile,
  bookRules: BookRules | null,
  language?: "zh" | "en" | "ko",
): string {
  const resolvedLang = language ?? genreProfile.language;
  const isEnglish = resolvedLang === "en";
  const isKorean = resolvedLang === "ko";
  const numericalBlock = isKorean
    ? (genreProfile.numericalSystem
      ? `\n- 본 장르에는 수치/자원 체계가 있습니다. UPDATED_LEDGER에서 본문에 등장하는 모든 자원 변동을 추적해야 합니다
- 수치 검증 철칙: 기초값 + 증감 = 기말값, 세 항목 모두 검증 가능해야 합니다`
      : `\n- 본 장르에는 수치 시스템이 없습니다. UPDATED_LEDGER는 비워 두세요`)
    : (genreProfile.numericalSystem
      ? `\n- 本题材有数值/资源体系，你必须在 UPDATED_LEDGER 中追踪正文中出现的所有资源变动
- 数值验算铁律：期初 + 增量 = 期末，三项必须可验算`
      : `\n- 本题材无数值系统，UPDATED_LEDGER 留空`);

  const hookRules = isKorean
    ? `
## 복선 추적 규칙 (엄격 적용)

- 신규 복선: 본문에 후속 회차까지 이어질, 구체적 회수 방향이 있는 미해결 문제가 등장할 때만 hook_id를 추가하세요. 기존 hook을 다른 말로 바꿔 쓰거나 요약해서 새 hook을 만들지 마세요
- 언급 복선: 기존 복선이 본 회차에서 언급되었으나 새로운 정보가 없고 독자/인물의 이해가 바뀌지 않았다면 → mention 배열에 넣고, 최근 진전을 갱신하지 마세요
- 진전 복선: 기존 복선에 새 사실·증거·관계 변화·위험 상승·범위 축소가 생겼다면 → "최근 진전" 열을 현재 회차 번호로 **반드시** 갱신하고, 상태와 비고를 업데이트하세요
- 회수 복선: 복선이 본 회차에서 명확히 밝혀지거나 해결되거나 더 이상 유효하지 않다면 → 상태를 "회수됨"으로 변경하고, 회수 방식을 비고에 기록하세요
- 보류 복선: 본문에서 해당 서사선이 능동적으로 보류되거나 후경으로 전환되거나 스토리에 의해 뒤로 밀렸을 때만 "보류"로 표기하세요. 단순히 "몇 화가 지났으니까"라는 이유로 기계적으로 보류하지 마세요
- 완전 새로운 미해결 서사선: hookId를 임의로 만들지 마세요. 후보를 newHookCandidates에 넣으면 시스템이 기존 hook에 매핑할지, 새 hook으로 확정할지, 중복으로 기각할지 결정합니다
- payoffTiming은 의미 기반 리듬으로 표기하며 회차 번호를 직접 쓰지 마세요: immediate / near-term / mid-arc / slow-burn / endgame만 허용
- **철칙**: "다시 언급됨", "다른 표현으로 재서술", "추상적 회고"는 진전이 아닙니다. 상태가 실제로 변했을 때만 최근 진전을 갱신하세요. 단순히 등장한 기존 hook은 mention 배열에 넣으세요.`
    : `
## 伏笔追踪规则（严格执行）

- 新伏笔：只有当正文中出现一个会延续到后续章节、且有具体回收方向的未解问题时，才新增 hook_id。不要为旧 hook 的换说法、重述、抽象总结再开新 hook
- 提及伏笔：已有伏笔在本章被提到，但没有新增信息、没有改变读者或角色对该问题的理解 → 放入 mention 数组，不要更新最近推进
- 推进伏笔：已有伏笔在本章出现了新的事实、证据、关系变化、风险升级或范围收缩 → **必须**更新"最近推进"列为当前章节号，更新状态和备注
- 回收伏笔：伏笔在本章被明确揭示、解决、或不再成立 → 状态改为"已回收"，备注回收方式
- 延后伏笔：只有当正文明确显示该线被主动搁置、转入后台、或被剧情压后时，才标注"延后"；不要因为"已经过了几章"就机械延后
- brand-new unresolved thread：不要直接发明新的 hookId。把候选放进 newHookCandidates，由系统决定它是映射到旧 hook、变成真正新 hook，还是被拒绝为重述
- payoffTiming 使用语义节奏，不用硬写章节号：只允许 immediate / near-term / mid-arc / slow-burn / endgame
- **铁律**：不要把"再次提到""换个说法重述""抽象复盘"当成推进。只有状态真的变了，才更新最近推进。只是出现过的旧 hook，放进 mention 数组。`;

  const fullCastBlock = isKorean
    ? (bookRules?.enableFullCastTracking
      ? `\n## 전원 추적\nPOST_SETTLEMENT에 추가로 포함: 본 회차 등장 인물 목록, 인물 간 관계 변동, 미등장이나 언급된 인물.`
      : "")
    : (bookRules?.enableFullCastTracking
      ? `\n## 全员追踪\nPOST_SETTLEMENT 必须额外包含：本章出场角色清单、角色间关系变动、未出场但被提及的角色。`
      : "");

  const langPrefix = isEnglish
    ? `【LANGUAGE OVERRIDE】ALL output (state card, hooks, summaries, subplots, emotional arcs, character matrix) MUST be in English. The === TAG === markers remain unchanged.\n\n`
    : isKorean
      ? `【언어 설정】모든 출력(상태 카드, 복선, 요약, 서브플롯, 감정선, 인물 관계 매트릭스)은 반드시 한국어로 작성하세요. === TAG === 마커는 그대로 유지합니다.\n\n`
      : "";

  const systemIntro = isEnglish
    ? `You are a state-tracking analyst. Given the new chapter text and current truth files, your task is to produce updated truth files.`
    : isKorean
      ? `당신은 상태 추적 분석가입니다. 새 회차 본문과 현재 truth 파일이 주어지면, 갱신된 truth 파일을 생성하는 것이 당신의 임무입니다.`
      : `你是状态追踪分析师。给定新章节正文和当前 truth 文件，你的任务是产出更新后的 truth 文件。`;

  const workingMode = isKorean
    ? `## 작업 모드

당신은 글을 쓰는 것이 아닙니다. 당신의 임무는:
1. 본문을 꼼꼼히 읽고, 모든 상태 변화를 추출
2. "현재 추적 파일"을 기반으로 증분 업데이트 수행
3. === TAG === 형식을 엄격히 준수하여 출력`
    : `## 工作模式

你不是在写作。你的任务是：
1. 仔细阅读正文，提取所有状态变化
2. 基于"当前追踪文件"做增量更新
3. 严格按照 === TAG === 格式输出`;

  const analysisDimensions = isKorean
    ? `## 분석 차원

본문에서 다음 정보를 추출하세요:
- 인물 등장·퇴장·상태 변화 (부상/각성/사망 등)
- 위치 이동, 장면 전환
- 아이템/자원의 획득과 소모
- 복선의 설치·진전·회수
- 감정선 변화
- 서브플롯 진행
- 인물 간 관계 변화, 새로운 정보 경계`
    : `## 分析维度

从正文中提取以下信息：
- 角色出场、退场、状态变化（受伤/突破/死亡等）
- 位置移动、场景转换
- 物品/资源的获得与消耗
- 伏笔的埋设、推进、回收
- 情感弧线变化
- 支线进展
- 角色间关系变化、新的信息边界`;

  const bookInfo = isKorean
    ? `## 작품 정보

- 제목: ${book.title}
- 장르: ${genreProfile.name} (${book.genre})
- 플랫폼: ${book.platform}`
    : `## 书籍信息

- 标题：${book.title}
- 题材：${genreProfile.name}（${book.genre}）
- 平台：${book.platform}`;

  const outputFormatHeader = isKorean
    ? `## 출력 형식 (반드시 엄격히 준수)`
    : `## 输出格式（必须严格遵循）`;

  const keyRules = isKorean
    ? `## 핵심 규칙

1. 상태 카드와 복선 풀은 "현재 추적 파일"을 기반으로 증분 업데이트해야 하며, 처음부터 다시 쓰지 않습니다
2. 본문의 모든 사실적 변화는 해당 추적 파일에 반영되어야 합니다
3. 세부사항을 누락하지 마세요: 수치 변화, 위치 변화, 관계 변화, 정보 변화를 모두 기록하세요
4. 인물 관계 매트릭스의 "정보 경계"는 정확해야 합니다 — 인물은 자신이 그 자리에 있었을 때 일어난 일만 알 수 있습니다`
    : `## 关键规则

1. 状态卡和伏笔池必须基于"当前追踪文件"做增量更新，不是从零开始
2. 正文中的每一个事实性变化都必须反映在对应的追踪文件中
3. 不要遗漏细节：数值变化、位置变化、关系变化、信息变化都要记录
4. 角色交互矩阵中的"信息边界"要准确——角色只知道他在场时发生的事`;

  const ironRule = isKorean
    ? `## 철칙: 본문에서 실제로 일어난 일만 기록할 것 (엄격 적용)

- **본문에 명확히 묘사된 사건과 상태 변화만 추출하세요**. 추론, 예측, 또는 본문에 없는 내용을 보충하지 마세요
- 본문에서 인물이 문 앞에 섰을 뿐 아직 들어가지 않았다면, 상태 카드에 "인물이 방에 들어감"이라고 쓸 수 없습니다
- 본문이 어떤 가능성만 암시했을 뿐 확인하지 않았다면, 이미 일어난 사실로 기록하지 마세요
- 볼륨 아웃라인이나 대강에서 아직 본문이 도달하지 않은 스토리를 상태 카드에 보충하지 마세요
- 기존 hooks 중 본 회차와 무관한 내용을 삭제하거나 수정하지 마세요 — 본 회차 본문이 관련된 hooks만 업데이트하세요
- 1화에 특히 주의: 초기 추적 파일에 아웃라인에서 사전 생성된 내용이 있을 수 있으며, 본문이 실제로 뒷받침하는 부분만 유지하고 본문에서 다루지 않은 사전 설정은 유지하지 마세요
- **복선 예외**: 본문에 등장하는 미해결 의문, 서스펜스, 복선 단서는 반드시 hooks에 기록하세요. 이것은 "추론"이 아니라 "본문 속 서사적 약속의 추출"입니다. 본문이 수수께끼/갈등/비밀을 암시했으나 해답을 주지 않았다면, 그것은 hook이며 반드시 기록해야 합니다`
    : `## 铁律：只记录正文中实际发生的事（严格执行）

- **只提取正文中明确描写的事件和状态变化**。不要推断、预测、或补充正文没有写到的内容
- 如果正文只写到角色走到门口还没进去，状态卡就不能写"角色已进入房间"
- 如果正文只暗示了某种可能性但没有确认，不要把它当作已发生的事实记录
- 不要从卷纲或大纲中补充正文尚未到达的剧情到状态卡
- 不要删除或修改已有 hooks 中与本章无关的内容——只更新本章正文涉及的 hooks
- 第 1 章尤其注意：初始追踪文件可能包含从大纲预生成的内容，只保留正文实际支持的部分，不要保留正文未涉及的预设
- **伏笔例外**：正文中出现的未解疑问、悬念、伏笔线索必须在 hooks 中记录。这不是"推断"，而是"提取正文中的叙事承诺"。如果正文暗示了一个谜题/冲突/秘密但没有解答，那就是一个 hook，必须记录`;

  return `${langPrefix}${systemIntro}

${workingMode}

${analysisDimensions}

${bookInfo}
${numericalBlock}
${hookRules}${fullCastBlock}

${outputFormatHeader}

${buildSettlerOutputFormat(genreProfile, resolvedLang)}

${keyRules}

${ironRule}`;
}

function buildSettlerOutputFormat(gp: GenreProfile, language?: string): string {
  const isKorean = language === "ko";
  const chapterTypeExample = gp.chapterTypes.length > 0
    ? gp.chapterTypes[0]
    : isKorean ? "본선 진행" : "主线推进";

  const postSettlementDesc = isKorean
    ? `（본 회차의 상태 변동, 복선 진전, 결산 주의사항을 간략히 설명; Markdown 표 또는 항목 허용）`
    : `（简要说明本章有哪些状态变动、伏笔推进、结算注意事项；允许 Markdown 表格或要点）`;

  const runtimeStateDesc = isKorean
    ? `（반드시 JSON으로 출력하세요. Markdown 금지, 설명 금지）`
    : `（必须输出 JSON，不要输出 Markdown，不要加解释）`;

  const jsonExample = isKorean
    ? `{
  "chapter": 12,
  "currentStatePatch": {
    "currentLocation": "선택",
    "protagonistState": "선택",
    "currentGoal": "선택",
    "currentConstraint": "선택",
    "currentAlliances": "선택",
    "currentConflict": "선택"
  },
  "hookOps": {
    "upsert": [
      {
        "hookId": "mentor-oath",
        "startChapter": 8,
        "type": "relationship",
        "status": "progressing",
        "lastAdvancedChapter": 12,
        "expectedPayoff": "사부의 빚에 얽힌 진실을 밝힌다",
        "payoffTiming": "slow-burn",
        "notes": "본 회차에서 왜 진전/보류/회수되었는가"
      }
    ],
    "mention": ["본 회차에서 언급만 되고 실질적 진전이 없는 hookId"],
    "resolve": ["회수된 hookId"],
    "defer": ["보류 표기가 필요한 hookId"]
  },
  "newHookCandidates": [
    {
      "type": "mystery",
      "expectedPayoff": "새 복선이 장래에 어디서 회수될지",
      "payoffTiming": "near-term",
      "notes": "본 회차에서 왜 새로운 미해결 문제가 생겼는가"
    }
  ],
  "chapterSummary": {
    "chapter": 12,
    "title": "본 회차 제목",
    "characters": "인물1,인물2",
    "events": "핵심 사건 한 줄 요약",
    "stateChanges": "상태 변화 한 줄 요약",
    "hookActivity": "mentor-oath advanced",
    "mood": "긴장",
    "chapterType": "${chapterTypeExample}"
  },
  "subplotOps": [],
  "emotionalArcOps": [],
  "characterMatrixOps": [],
  "notes": []
}`
    : `{
  "chapter": 12,
  "currentStatePatch": {
    "currentLocation": "可选",
    "protagonistState": "可选",
    "currentGoal": "可选",
    "currentConstraint": "可选",
    "currentAlliances": "可选",
    "currentConflict": "可选"
  },
  "hookOps": {
    "upsert": [
      {
        "hookId": "mentor-oath",
        "startChapter": 8,
        "type": "relationship",
        "status": "progressing",
        "lastAdvancedChapter": 12,
        "expectedPayoff": "揭开师债真相",
        "payoffTiming": "slow-burn",
        "notes": "本章为何推进/延后/回收"
      }
    ],
    "mention": ["本章只是被提到、没有真实推进的 hookId"],
    "resolve": ["已回收的 hookId"],
    "defer": ["需要标记延后的 hookId"]
  },
  "newHookCandidates": [
    {
      "type": "mystery",
      "expectedPayoff": "新伏笔未来要回收到哪里",
      "payoffTiming": "near-term",
      "notes": "本章为什么会形成新的未解问题"
    }
  ],
  "chapterSummary": {
    "chapter": 12,
    "title": "本章标题",
    "characters": "角色1,角色2",
    "events": "一句话概括关键事件",
    "stateChanges": "一句话概括状态变化",
    "hookActivity": "mentor-oath advanced",
    "mood": "紧绷",
    "chapterType": "${chapterTypeExample}"
  },
  "subplotOps": [],
  "emotionalArcOps": [],
  "characterMatrixOps": [],
  "notes": []
}`;

  const rulesBlock = isKorean
    ? `규칙:
1. 증분만 출력하세요. 전체 truth files를 다시 작성하지 마세요
2. 모든 회차 번호 필드는 반드시 정수여야 하며, 자연어로 쓸 수 없습니다
3. hookOps.upsert에는 "현재 복선 풀에 이미 존재하는" hookId만 쓸 수 있으며, 새 hookId를 임의로 만들 수 없습니다
4. 완전히 새로운 미해결 서사선은 반드시 newHookCandidates에 넣으세요. hookId를 직접 만들지 마세요
5. 기존 hook이 언급만 되고 실질적 상태 변화가 없으면 mention에 넣고, lastAdvancedChapter를 갱신하지 마세요
6. 본 회차에서 기존 hook이 진전되었다면 lastAdvancedChapter는 반드시 현재 회차 번호와 같아야 합니다
7. hook을 회수하거나 보류한다면 반드시 resolve / defer 배열에 넣으세요
8. chapterSummary.chapter는 반드시 현재 회차 번호와 같아야 합니다`
    : `规则：
1. 只输出增量，不要重写完整 truth files
2. 所有章节号字段都必须是整数，不能写自然语言
3. hookOps.upsert 里只能写"当前伏笔池里已经存在"的 hookId，不允许发明新的 hookId
4. brand-new unresolved thread 一律写进 newHookCandidates，不要自造 hookId
5. 如果旧 hook 只是被提到、没有真实状态变化，把它放进 mention，不要更新 lastAdvancedChapter
6. 如果本章推进了旧 hook，lastAdvancedChapter 必须等于当前章号
7. 如果回收或延后 hook，必须放在 resolve / defer 数组里
8. chapterSummary.chapter 必须等于当前章节号`;

  return `=== POST_SETTLEMENT ===
${postSettlementDesc}

=== RUNTIME_STATE_DELTA ===
${runtimeStateDesc}
\`\`\`json
${jsonExample}
\`\`\`

${rulesBlock}`;
}

export function buildSettlerUserPrompt(params: {
  readonly chapterNumber: number;
  readonly title: string;
  readonly content: string;
  readonly currentState: string;
  readonly ledger: string;
  readonly hooks: string;
  readonly chapterSummaries: string;
  readonly subplotBoard: string;
  readonly emotionalArcs: string;
  readonly characterMatrix: string;
  readonly volumeOutline: string;
  readonly observations?: string;
  readonly selectedEvidenceBlock?: string;
  readonly governedControlBlock?: string;
  readonly validationFeedback?: string;
  readonly language?: "zh" | "en" | "ko";
}): string {
  const isKorean = params.language === "ko";
  const notCreatedMarker = isKorean ? "(파일 미생성)" : "(文件尚未创建)";

  const ledgerBlock = params.ledger
    ? `\n## ${isKorean ? "현재 자원 장부" : "当前资源账本"}\n${params.ledger}\n`
    : "";

  const summariesBlock = params.chapterSummaries !== "(文件尚未创建)" && params.chapterSummaries !== notCreatedMarker
    ? `\n## ${isKorean ? "기존 회차 요약" : "已有章节摘要"}\n${params.chapterSummaries}\n`
    : "";

  const subplotBlock = params.subplotBoard !== "(文件尚未创建)" && params.subplotBoard !== notCreatedMarker
    ? `\n## ${isKorean ? "현재 서브플롯 진행판" : "当前支线进度板"}\n${params.subplotBoard}\n`
    : "";

  const emotionalBlock = params.emotionalArcs !== "(文件尚未创建)" && params.emotionalArcs !== notCreatedMarker
    ? `\n## ${isKorean ? "현재 감정선" : "当前情感弧线"}\n${params.emotionalArcs}\n`
    : "";

  const matrixBlock = params.characterMatrix !== "(文件尚未创建)" && params.characterMatrix !== notCreatedMarker
    ? `\n## ${isKorean ? "현재 인물 관계 매트릭스" : "当前角色交互矩阵"}\n${params.characterMatrix}\n`
    : "";

  const observationsBlock = params.observations
    ? isKorean
      ? `\n## 관찰 일지 (Observer가 추출한 본 회차의 모든 사실 변화)\n${params.observations}\n\n위 관찰 일지와 본문을 기반으로 모든 추적 파일을 업데이트하세요. 관찰 일지의 모든 변화가 해당 파일에 반영되었는지 확인하세요.\n`
      : `\n## 观察日志（由 Observer 提取，包含本章所有事实变化）\n${params.observations}\n\n基于以上观察日志和正文，更新所有追踪文件。确保观察日志中的每一项变化都反映在对应的文件中。\n`
    : "";
  const selectedEvidenceBlock = params.selectedEvidenceBlock
    ? `\n## ${isKorean ? "선택된 장기 증거" : "已选长程证据"}\n${params.selectedEvidenceBlock}\n`
    : "";
  const controlBlock = params.governedControlBlock ?? "";
  const outlineBlock = controlBlock.length === 0
    ? `\n## ${isKorean ? "볼륨 아웃라인" : "卷纲"}\n${params.volumeOutline}\n`
    : "";
  const validationFeedbackBlock = params.validationFeedback
    ? isKorean
      ? `\n## 상태 검증 피드백\n${params.validationFeedback}\n\n이 모순들을 엄격히 교정하세요. truth files만 수정하고, 본문을 고쳐 쓰지 말고, 본문에 없는 새로운 사실을 도입하지 마세요.\n`
      : `\n## 状态校验反馈\n${params.validationFeedback}\n\n请严格纠正这些矛盾，只修正 truth files，不要改写正文，不要引入正文中不存在的新事实。\n`
    : "";

  const chapterLabel = isKorean ? "화" : "章";
  const intro = isKorean
    ? `${params.chapterNumber}화 「${params.title}」의 본문을 분석하고, 모든 추적 파일을 업데이트하세요.`
    : `请分析第${params.chapterNumber}章「${params.title}」的正文，更新所有追踪文件。`;
  const outro = isKorean
    ? `=== TAG === 형식을 엄격히 준수하여 결산 결과를 출력하세요.`
    : `请严格按照 === TAG === 格式输出结算结果。`;

  return `${intro}
${observationsBlock}
${validationFeedbackBlock}
## ${isKorean ? "본 회차 본문" : "本章正文"}

${params.content}
${controlBlock}

## ${isKorean ? "현재 상태 카드" : "当前状态卡"}
${params.currentState}
${ledgerBlock}
## ${isKorean ? "현재 복선 풀" : "当前伏笔池"}
${params.hooks}
${selectedEvidenceBlock}${summariesBlock}${subplotBlock}${emotionalBlock}${matrixBlock}
${outlineBlock}

${outro}`;
}
