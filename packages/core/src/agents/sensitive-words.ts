/**
 * Sensitive word detection — rule-based analysis (no LLM).
 *
 * Detects politically sensitive, sexually explicit, and extremely violent terms
 * in Chinese web novel content. Used in audit pipeline to flag or block content.
 */

import type { AuditIssue } from "./continuity.js";

export interface SensitiveWordMatch {
  readonly word: string;
  readonly count: number;
  readonly severity: "block" | "warn";
}

export interface SensitiveWordResult {
  readonly issues: ReadonlyArray<AuditIssue>;
  readonly found: ReadonlyArray<SensitiveWordMatch>;
}

type SensitiveWordLanguage = "zh" | "en" | "ko";

// Political terms — severity "block"
const POLITICAL_WORDS: ReadonlyArray<string> = [
  "习近平", "习主席", "习总书记", "共产党", "中国共产党", "共青团",
  "六四", "天安门事件", "天安门广场事件", "法轮功", "法轮大法",
  "台独", "藏独", "疆独", "港独",
  "新疆集中营", "再教育营",
  "维吾尔", "达赖喇嘛", "达赖",
  "刘晓波", "艾未未", "赵紫阳",
  "文化大革命", "文革", "大跃进",
  "反右运动", "镇压", "六四屠杀",
  "中南海", "政治局常委",
  "翻墙", "防火长城",
];

// Sexual terms — severity "warn"
const SEXUAL_WORDS: ReadonlyArray<string> = [
  "性交", "做爱", "口交", "肛交", "自慰", "手淫",
  "阴茎", "阴道", "阴蒂", "乳房", "乳头",
  "射精", "高潮", "潮吹",
  "淫荡", "淫乱", "荡妇", "婊子",
  "强奸", "轮奸",
];

// Extreme violence — severity "warn"
const VIOLENCE_EXTREME: ReadonlyArray<string> = [
  "肢解", "碎尸", "挖眼", "剥皮", "开膛破肚",
  "虐杀", "凌迟", "活剥", "活埋", "烹煮活人",
];

// Korean platform review standards (카카오페이지/네이버 시리즈 심의 기준)
// Platform-prohibited terms — severity "block"
const KO_PLATFORM_BLOCKED: ReadonlyArray<string> = [
  "자살 방법", "자살 수단", "자해 방법",
  "마약 제조", "마약 투여 방법", "필로폰", "대마초 흡입",
  "아동 성적", "미성년 성행위", "아동 포르노",
  "실존 정치인", "실존 연예인",
  "특정 종교 비하", "특정 민족 비하",
];

// Korean sexual terms — severity "warn"
const KO_SEXUAL_WORDS: ReadonlyArray<string> = [
  "성행위", "성관계", "삽입", "애무", "자위",
  "음경", "질내", "유두", "음핵",
  "사정", "오르가즘", "절정",
  "음란", "음탕", "창녀", "매춘",
  "강간", "성폭행", "성추행",
];

// Korean extreme violence — severity "warn"
const KO_VIOLENCE_EXTREME: ReadonlyArray<string> = [
  "사지절단", "시체훼손", "안구적출", "피부벗기기",
  "내장적출", "학살묘사", "고문묘사", "생매장",
  "인육", "식인",
];

interface WordListEntry {
  readonly words: ReadonlyArray<string>;
  readonly severity: "block" | "warn";
  readonly label: string;
  readonly englishLabel: string;
  readonly koreanLabel: string;
}

const WORD_LISTS: ReadonlyArray<WordListEntry> = [
  { words: POLITICAL_WORDS, severity: "block", label: "政治敏感词", englishLabel: "political sensitive terms", koreanLabel: "정치 민감어" },
  { words: SEXUAL_WORDS, severity: "warn", label: "色情敏感词", englishLabel: "sexual sensitive terms", koreanLabel: "성적 민감어" },
  { words: VIOLENCE_EXTREME, severity: "warn", label: "极端暴力词", englishLabel: "extreme violence terms", koreanLabel: "극단적 폭력 표현" },
];

const KO_WORD_LISTS: ReadonlyArray<WordListEntry> = [
  { words: KO_PLATFORM_BLOCKED, severity: "block", label: "플랫폼 금지어", englishLabel: "platform-blocked terms", koreanLabel: "플랫폼 금지어" },
  { words: KO_SEXUAL_WORDS, severity: "warn", label: "성적 민감어", englishLabel: "sexual sensitive terms", koreanLabel: "성적 민감어" },
  { words: KO_VIOLENCE_EXTREME, severity: "warn", label: "극단적 폭력 표현", englishLabel: "extreme violence terms", koreanLabel: "극단적 폭력 표현" },
];

/**
 * Analyze text content for sensitive words.
 * Returns issues that can be merged into audit results.
 */
export function analyzeSensitiveWords(
  content: string,
  customWords?: ReadonlyArray<string>,
  language: SensitiveWordLanguage = "zh",
): SensitiveWordResult {
  const found: SensitiveWordMatch[] = [];
  const issues: AuditIssue[] = [];
  const isEnglish = language === "en";
  const isKorean = language === "ko";
  const joiner = isEnglish ? ", " : isKorean ? ", " : "、";

  // Choose word lists based on language
  const activeLists = isKorean ? KO_WORD_LISTS : WORD_LISTS;

  // Check built-in word lists
  for (const list of activeLists) {
    const matches = scanWords(content, list.words, list.severity);
    if (matches.length > 0) {
      found.push(...matches);
      const wordSummary = matches.map((m) => `"${m.word}"×${m.count}`).join(joiner);
      const displayLabel = isKorean ? list.koreanLabel : isEnglish ? list.englishLabel : list.label;
      issues.push({
        severity: list.severity === "block" ? "critical" : "warning",
        category: isEnglish ? "Sensitive terms" : isKorean ? "민감어" : "敏感词",
        description: isEnglish
          ? `Detected ${list.englishLabel}: ${wordSummary}`
          : isKorean
            ? `${displayLabel} 감지: ${wordSummary}`
            : `检测到${list.label}：${wordSummary}`,
        suggestion: isEnglish
          ? (list.severity === "block"
              ? "You must remove or replace these blocked terms before publication"
              : `Replace or soften these ${list.englishLabel} to reduce moderation risk`)
          : isKorean
            ? (list.severity === "block"
                ? "출판 전에 반드시 이 금지어를 삭제하거나 대체해야 합니다"
                : `${displayLabel}을(를) 교체하거나 완화하여 플랫폼 심의 위험을 줄이세요`)
            : (list.severity === "block"
                ? "必须删除或替换政治敏感词，否则无法发布"
                : `建议替换或弱化${list.label}，避免平台审核问题`),
      });
    }
  }

  // Check custom words
  if (customWords && customWords.length > 0) {
    const customMatches = scanWords(content, customWords, "warn");
    if (customMatches.length > 0) {
      found.push(...customMatches);
      const wordSummary = customMatches.map((m) => `"${m.word}"×${m.count}`).join(joiner);
      issues.push({
        severity: "warning",
        category: isEnglish ? "Sensitive terms" : isKorean ? "민감어" : "敏感词",
        description: isEnglish
          ? `Detected custom sensitive term(s): ${wordSummary}`
          : isKorean
            ? `사용자 지정 민감어 감지: ${wordSummary}`
            : `检测到自定义敏感词：${wordSummary}`,
        suggestion: isEnglish
          ? "Replace or remove these terms according to project rules"
          : isKorean
            ? "프로젝트 규칙에 따라 해당 표현을 교체하거나 삭제하세요"
            : "根据项目规则替换或删除这些词语",
      });
    }
  }

  return { issues, found };
}

function scanWords(
  content: string,
  words: ReadonlyArray<string>,
  severity: "block" | "warn",
): ReadonlyArray<SensitiveWordMatch> {
  const matches: SensitiveWordMatch[] = [];
  for (const word of words) {
    const regex = new RegExp(escapeRegExp(word), "g");
    const hits = content.match(regex);
    if (hits && hits.length > 0) {
      matches.push({ word, count: hits.length, severity });
    }
  }
  return matches;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
