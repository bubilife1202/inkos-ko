import type { BookConfig } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";

/**
 * Observer phase: extract ALL facts from the chapter.
 * Intentionally over-extracts — better to catch too much than miss something.
 * The Reflector phase will merge observations into truth files with cross-validation.
 */
export function buildObserverSystemPrompt(
  book: BookConfig,
  genreProfile: GenreProfile,
  language?: "zh" | "en" | "ko",
): string {
  const resolvedLang = language ?? genreProfile.language;
  const isEnglish = resolvedLang === "en";
  const isKorean = resolvedLang === "ko";

  const langPrefix = isEnglish
    ? "【LANGUAGE OVERRIDE】ALL output MUST be in English.\n\n"
    : isKorean
      ? "【언어 설정】모든 출력은 반드시 한국어로 작성하세요.\n\n"
      : "";

  const intro = isEnglish
    ? "You are a fact extraction specialist. Read the chapter text and extract EVERY observable fact change."
    : isKorean
      ? "당신은 사실 추출 전문가입니다. 회차 본문을 읽고 관찰 가능한 모든 사실 변화를 추출하세요."
      : "你是一个事实提取专家。阅读章节正文，提取每一个可观察到的事实变化。";

  const categoriesHeader = isEnglish
    ? "## Extraction Categories"
    : isKorean
      ? "## 추출 항목"
      : "## 提取类别";

  const categories = isEnglish
    ? `1. **Character actions**: Who did what, to whom, why
2. **Location changes**: Who moved where, from where
3. **Resource changes**: Items gained, lost, consumed, quantities
4. **Relationship changes**: New encounters, trust/distrust shifts, alliances, betrayals
5. **Emotional shifts**: Character mood before → after, trigger event
6. **Information flow**: Who learned what, who is still unaware
7. **Plot threads**: New mysteries planted, existing threads advanced, threads resolved
8. **Time progression**: How much time passed, time markers mentioned
9. **Physical state**: Injuries, healing, fatigue, power changes`
    : isKorean
      ? `1. **인물 행동**: 누가 무엇을 했는가, 누구에게, 왜
2. **위치 변화**: 누가 어디로 이동했는가, 어디에서
3. **재화/자원 변화**: 획득·소실·소모한 것, 구체적 수량
4. **관계 변화**: 새로운 만남, 신뢰/불신 전환, 동맹, 배신
5. **감정 변화**: 인물 감정 X → Y, 촉발 사건
6. **정보 흐름**: 누가 무엇을 알게 되었는가, 누가 아직 모르는가
7. **서사 복선**: 새로 깔린 떡밥, 기존 복선의 진전, 복선 회수
8. **시간 경과**: 얼마나 시간이 흘렀는가, 언급된 시간 표지
9. **신체 상태**: 부상, 회복, 피로, 전투력 변화`
      : `1. **角色行为**：谁做了什么，对谁，为什么
2. **位置变化**：谁去了哪里，从哪里来
3. **资源变化**：获得、失去、消耗了什么，具体数量
4. **关系变化**：新相遇、信任/不信任转变、结盟、背叛
5. **情绪变化**：角色情绪从X到Y，触发事件是什么
6. **信息流动**：谁知道了什么新信息，谁仍然不知情
7. **剧情线索**：新埋下的悬念、已有线索的推进、线索的解答
8. **时间推进**：过了多少时间，提到的时间标记
9. **身体状态**：受伤、恢复、疲劳、战力变化`;

  const rulesHeader = isEnglish
    ? "## Rules"
    : isKorean
      ? "## 규칙"
      : "## 规则";

  const rules = isEnglish
    ? `- Extract from the TEXT ONLY — do not infer what might happen
- Over-extract: if unsure whether something is significant, include it
- Be specific: "Lin Chen's left arm fractured" not "Lin Chen got hurt"
- Include chapter-internal time markers
- Note which characters are present in each scene`
    : isKorean
      ? `- 본문에서만 추출할 것 — 앞으로 일어날 일을 추측하지 말 것
- 과다 추출 원칙: 중요한지 확신이 없으면 일단 기록할 것
- 구체적으로: "강민혁의 왼쪽 어깨에 깊은 자상" (O) / "강민혁이 다쳤다" (X)
- 회차 내부의 시간 표지를 기록할 것
- 각 장면에 등장하는 인물을 표기할 것`
      : `- 只从正文提取——不推测可能发生的事
- 宁多勿少：不确定是否重要时也要记录
- 具体化："陆承烬左肩旧伤开裂" 而非 "陆承烬受伤了"
- 记录章节内的时间标记
- 标注每个场景中在场的角色`;

  const formatHeader = isEnglish
    ? "## Output Format"
    : isKorean
      ? "## 출력 형식"
      : "## 输出格式";

  const outputFormat = isEnglish
    ? `[CHARACTERS]
- <name>: <action/state change> (scene: <location>)

[LOCATIONS]
- <character> moved from <A> to <B>

[RESOURCES]
- <character> gained/lost <item> (quantity: <n>)

[RELATIONSHIPS]
- <charA> → <charB>: <change description>

[EMOTIONS]
- <character>: <before> → <after> (trigger: <event>)

[INFORMATION]
- <character> learned: <fact> (source: <how>)
- <character> still unaware of: <fact>

[PLOT_THREADS]
- NEW: <description>
- ADVANCED: <existing thread> — <progress>
- RESOLVED: <thread> — <resolution>

[TIME]
- <time markers, duration>

[PHYSICAL_STATE]
- <character>: <injury/healing/fatigue/power change>`
    : isKorean
      ? `[인물 행동]
- <인물명>: <행동/상태 변화> (장면: <장소>)

[위치 변화]
- <인물> 이동: <A>에서 <B>로

[재화 변화]
- <인물> 획득/소실 <아이템> (수량: <n>)

[관계 변화]
- <인물A> → <인물B>: <변화 설명>

[감정 변화]
- <인물>: <이전> → <이후> (촉발: <사건>)

[정보 흐름]
- <인물> 인지: <사실> (경로: <방법>)
- <인물> 미인지: <사실>

[서사 복선]
- 신규: <설명>
- 진전: <기존 복선> — <진척>
- 회수: <복선> — <해소>

[시간]
- <시간 표지, 경과 시간>

[신체 상태]
- <인물>: <부상/회복/피로/전투력 변화>`
      : `[角色行为]
- <角色名>: <行为/状态变化> (场景: <地点>)

[位置变化]
- <角色> 从 <A> 到 <B>

[资源变化]
- <角色> 获得/失去 <物品> (数量: <n>)

[关系变化]
- <角色A> → <角色B>: <变化描述>

[情绪变化]
- <角色>: <之前> → <之后> (触发: <事件>)

[信息流动]
- <角色> 得知: <事实> (来源: <途径>)
- <角色> 仍不知: <事实>

[剧情线索]
- 新埋: <描述>
- 推进: <已有线索> — <进展>
- 回收: <线索> — <解答>

[时间]
- <时间标记、时长>

[身体状态]
- <角色>: <受伤/恢复/疲劳/战力变化>`;

  return `${langPrefix}${intro}

${categoriesHeader}

${categories}

${rulesHeader}

${rules}

${formatHeader}

=== OBSERVATIONS ===

${outputFormat}`;
}

export function buildObserverUserPrompt(
  chapterNumber: number,
  title: string,
  content: string,
  language?: "zh" | "en" | "ko",
): string {
  if (language === "en") {
    return `Extract all facts from Chapter ${chapterNumber} "${title}":\n\n${content}`;
  }
  if (language === "ko") {
    return `${chapterNumber}화 「${title}」에서 모든 사실을 추출하세요:\n\n${content}`;
  }
  return `请提取第${chapterNumber}章「${title}」中的所有事实：\n\n${content}`;
}
