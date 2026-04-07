/**
 * Structural AI-tell detection — pure rule-based analysis (no LLM).
 *
 * Detects patterns common in AI-generated Chinese text:
 * - dim 20: Paragraph length uniformity (low variance)
 * - dim 21: Filler/hedge word density
 * - dim 22: Formulaic transition patterns
 * - dim 23: List-like structure (consecutive same-prefix sentences)
 */

export interface AITellIssue {
  readonly severity: "warning" | "info";
  readonly category: string;
  readonly description: string;
  readonly suggestion: string;
}

export interface AITellResult {
  readonly issues: ReadonlyArray<AITellIssue>;
}

type AITellLanguage = "zh" | "en" | "ko";

const HEDGE_WORDS: Record<AITellLanguage, ReadonlyArray<string>> = {
  zh: ["似乎", "可能", "或许", "大概", "某种程度上", "一定程度上", "在某种意义上"],
  en: ["seems", "seemed", "perhaps", "maybe", "apparently", "in some ways", "to some extent"],
  ko: ["아마도", "어쩌면", "다소", "어느 정도", "혹시", "아마"],
};

const TRANSITION_WORDS: Record<AITellLanguage, ReadonlyArray<string>> = {
  zh: ["然而", "不过", "与此同时", "另一方面", "尽管如此", "话虽如此", "但值得注意的是"],
  en: ["however", "meanwhile", "on the other hand", "nevertheless", "even so", "still"],
  ko: ["하지만", "그러나", "한편", "반면에", "그럼에도", "그런데", "그렇지만"],
};

/**
 * Analyze text content for structural AI-tell patterns.
 * Returns issues that can be merged into audit results.
 */
export function analyzeAITells(content: string, language: AITellLanguage = "zh"): AITellResult {
  const issues: AITellIssue[] = [];
  const isEnglish = language === "en";
  const isKorean = language === "ko";
  const joiner = isEnglish ? ", " : isKorean ? ", " : "、";

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // dim 20: Paragraph length uniformity (needs ≥3 paragraphs)
  if (paragraphs.length >= 3) {
    const paragraphLengths = paragraphs.map((p) => p.length);
    const mean = paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length;
    if (mean > 0) {
      const variance = paragraphLengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / paragraphLengths.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean;
      if (cv < 0.15) {
        issues.push({
          severity: "warning",
          category: isEnglish ? "Paragraph uniformity" : isKorean ? "문단 균일성" : "段落等长",
          description: isEnglish
            ? `Paragraph-length coefficient of variation is only ${cv.toFixed(3)} (threshold <0.15), which suggests unnaturally uniform paragraph sizing`
            : isKorean
              ? `문단 길이 변이 계수가 ${cv.toFixed(3)}에 불과합니다(기준 <0.15). 문단 길이가 지나치게 균일하여 AI 생성 특성을 보입니다`
              : `段落长度变异系数仅${cv.toFixed(3)}（阈值<0.15），段落长度过于均匀，呈现AI生成特征`,
          suggestion: isEnglish
            ? "Increase paragraph-length contrast: use shorter beats for impact and longer blocks for immersive detail"
            : isKorean
              ? "문단 길이에 변화를 주세요: 짧은 문단으로 임팩트를, 긴 문단으로 몰입감을 만드세요"
              : "增加段落长度差异：短段落用于节奏加速或冲击，长段落用于沉浸描写",
        });
      }
    }
  }

  // dim 21: Hedge word density
  const totalChars = content.length;
  if (totalChars > 0) {
    let hedgeCount = 0;
    for (const word of HEDGE_WORDS[language]) {
      const regex = new RegExp(word, isEnglish ? "gi" : "g");
      const matches = content.match(regex);
      hedgeCount += matches?.length ?? 0;
    }
    const hedgeDensity = hedgeCount / (totalChars / 1000);
    if (hedgeDensity > 3) {
      issues.push({
        severity: "warning",
        category: isEnglish ? "Hedge density" : isKorean ? "애매한 표현 밀도" : "套话密度",
        description: isEnglish
          ? `Hedge-word density is ${hedgeDensity.toFixed(1)} per 1k characters (threshold >3), making the prose sound overly tentative`
          : isKorean
            ? `애매한 표현(아마도/어쩌면/다소 등) 밀도가 ${hedgeDensity.toFixed(1)}회/천자(기준 >3)로, 어조가 지나치게 모호합니다`
            : `套话词（似乎/可能/或许等）密度为${hedgeDensity.toFixed(1)}次/千字（阈值>3），语气过于模糊犹豫`,
        suggestion: isEnglish
          ? "Replace hedges with firmer narration: remove vague qualifiers and use concrete detail instead"
          : isKorean
            ? "확정적 서술로 교체하세요: '아마도'를 삭제하고 구체적 묘사로, '어쩌면'을 단정적 표현으로 바꾸세요"
            : "用确定性叙述替代模糊表达：去掉「似乎」直接描述状态，用具体细节替代「可能」",
      });
    }
  }

  // dim 22: Formulaic transition repetition
  const transitionCounts: Record<string, number> = {};
  for (const word of TRANSITION_WORDS[language]) {
    const regex = new RegExp(word, isEnglish ? "gi" : "g");
    const matches = content.match(regex);
    const count = matches?.length ?? 0;
    if (count > 0) {
      transitionCounts[isEnglish ? word.toLowerCase() : word] = count;
    }
  }
  const repeatedTransitions = Object.entries(transitionCounts)
    .filter(([, count]) => count >= 3);
  if (repeatedTransitions.length > 0) {
    const detail = repeatedTransitions
      .map(([word, count]) => `"${word}"×${count}`)
      .join(joiner);
    issues.push({
      severity: "warning",
      category: isEnglish ? "Formulaic transitions" : isKorean ? "공식적 전환어" : "公式化转折",
      description: isEnglish
        ? `Transition words repeat too often: ${detail}. Reusing the same transition pattern 3+ times creates a formulaic AI texture`
        : isKorean
          ? `전환어가 과도하게 반복됩니다: ${detail}. 동일한 전환 패턴이 3회 이상 반복되면 AI 생성 흔적이 드러납니다`
          : `转折词重复使用：${detail}。同一转折模式≥3次暴露AI生成痕迹`,
      suggestion: isEnglish
        ? "Let scenes pivot through action, timing, or viewpoint shifts instead of repeating the same transitions"
        : isKorean
          ? "전환어 대신 장면의 자연스러운 전환을 활용하세요 (행동 전환, 시간 점프, 시점 변경)"
          : "用情节自然转折替代转折词，或换用不同的过渡手法（动作切入、时间跳跃、视角切换）",
    });
  }

  // dim 23: List-like structure (consecutive sentences with same prefix pattern)
  const sentences = content
    .split(isEnglish ? /[.!?\n]/ : /[。！？.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  if (sentences.length >= 3) {
    let consecutiveSamePrefix = 1;
    let maxConsecutive = 1;
    for (let i = 1; i < sentences.length; i++) {
      const prevPrefix = isEnglish
        ? sentences[i - 1]!.split(/\s+/)[0]?.toLowerCase() ?? ""
        : sentences[i - 1]!.slice(0, 2);
      const currPrefix = isEnglish
        ? sentences[i]!.split(/\s+/)[0]?.toLowerCase() ?? ""
        : sentences[i]!.slice(0, 2);
      if (prevPrefix === currPrefix) {
        consecutiveSamePrefix++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveSamePrefix);
      } else {
        consecutiveSamePrefix = 1;
      }
    }
    if (maxConsecutive >= 3) {
      issues.push({
        severity: "info",
        category: isEnglish ? "List-like structure" : isKorean ? "나열식 구조" : "列表式结构",
        description: isEnglish
          ? `Detected ${maxConsecutive} consecutive sentences with the same opening pattern, creating a list-like generated cadence`
          : isKorean
            ? `동일한 시작 패턴의 문장이 ${maxConsecutive}개 연속으로 감지되었습니다. 나열식 AI 생성 구조를 보입니다`
            : `检测到${maxConsecutive}句连续以相同开头的句子，呈现列表式AI生成结构`,
        suggestion: isEnglish
          ? "Vary how sentences open: change subject, timing, or action entry to break the list effect"
          : isKorean
            ? "문장 시작을 다양하게 바꾸세요: 다른 주어, 시간어, 행동어로 시작하여 나열감을 깨세요"
            : "变换句式开头：用不同主语、时间词、动作词开头，打破列表感",
      });
    }
  }

  return { issues };
}
