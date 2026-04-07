import { formatLengthCount, resolveLengthCountingMode } from "@actalk/inkos-core";

export type CliLanguage = "zh" | "en" | "ko";

type WriteIssue = {
  readonly severity: string;
  readonly category: string;
  readonly description: string;
};

type WriteResultShape = {
  readonly chapterNumber: number;
  readonly title: string;
  readonly wordCount: number;
  readonly status: string;
  readonly revised: boolean;
  readonly issues: ReadonlyArray<WriteIssue>;
  readonly auditPassed?: boolean;
  readonly passedAudit?: boolean;
};

type ImportResultShape = {
  readonly importedCount: number;
  readonly totalWords: number;
  readonly nextChapter: number;
  readonly continueBookId: string;
};

function localize(language: CliLanguage, messages: { zh: string; en: string; ko?: string }): string {
  if (language === "en") return messages.en;
  if (language === "ko") return messages.ko ?? messages.en;
  return messages.zh;
}

export function resolveCliLanguage(language?: string): CliLanguage {
  if (language === "en") return "en";
  if (language === "ko") return "ko";
  return "zh";
}

export function formatBookCreateResume(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `继续未完成的书籍创建：「${bookId}」...`,
    en: `Resuming incomplete book creation for "${bookId}"...`,
    ko: `미완료된 작품 생성 재개: "${bookId}"...`,
  });
}

export function formatBookCreateCreating(
  language: CliLanguage,
  title: string,
  genre: string,
  platform: string,
): string {
  return localize(language, {
    zh: `创建书籍 "${title}"（${genre} / ${platform}）...`,
    en: `Creating book "${title}" (${genre} / ${platform})...`,
    ko: `작품 생성 "${title}" (${genre} / ${platform})...`,
  });
}

export function formatBookCreateCreated(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `已创建书籍：${bookId}`,
    en: `Book created: ${bookId}`,
    ko: `작품 생성 완료: ${bookId}`,
  });
}

export function formatBookCreateLocation(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `  位置：books/${bookId}/`,
    en: `  Location: books/${bookId}/`,
    ko: `  위치: books/${bookId}/`,
  });
}

export function formatBookCreateFoundationReady(language: CliLanguage): string {
  return localize(language, {
    zh: "  故事圣经、大纲和书籍规则已生成。",
    en: "  Story bible, outline, book rules generated.",
    ko: "  스토리 바이블, 아웃라인, 작품 규칙이 생성되었습니다.",
  });
}

export function formatBookCreateNextStep(language: CliLanguage, bookId: string): string {
  return localize(language, {
    zh: `下一步：inkos write next ${bookId}`,
    en: `Next: inkos write next ${bookId}`,
    ko: `다음 단계: inkos write next ${bookId}`,
  });
}

export function formatWriteNextProgress(
  language: CliLanguage,
  current: number,
  total: number,
  bookId: string,
): string {
  return localize(language, {
    zh: `[${current}/${total}] 为「${bookId}」撰写章节...`,
    en: `[${current}/${total}] Writing chapter for "${bookId}"...`,
    ko: `[${current}/${total}] "${bookId}" 챕터 작성 중...`,
  });
}

export function formatWriteNextResultLines(
  language: CliLanguage,
  result: WriteResultShape,
): string[] {
  const auditPassed = result.auditPassed ?? result.passedAudit ?? false;
  const lengthLabel = formatLengthCount(result.wordCount, resolveLengthCountingMode(language));
  const lines = [
    localize(language, {
      zh: `  第${result.chapterNumber}章：${result.title}`,
      en: `  Chapter ${result.chapterNumber}: ${result.title}`,
      ko: `  제${result.chapterNumber}화: ${result.title}`,
    }),
    localize(language, {
      zh: `  字数：${lengthLabel}`,
      en: `  Length: ${lengthLabel}`,
      ko: `  글자수: ${lengthLabel}`,
    }),
    localize(language, {
      zh: `  审计：${auditPassed ? "通过" : "需复核"}`,
      en: `  Audit: ${auditPassed ? "PASSED" : "NEEDS REVIEW"}`,
      ko: `  검수: ${auditPassed ? "통과" : "검토 필요"}`,
    }),
  ];

  if (result.revised) {
    lines.push(localize(language, {
      zh: "  自动修正：已执行（已修复关键问题）",
      en: "  Auto-revised: YES (critical issues were fixed)",
      ko: "  자동 수정: 예 (중요 문제가 수정되었습니다)",
    }));
  }

  lines.push(localize(language, {
    zh: `  状态：${result.status}`,
    en: `  Status: ${result.status}`,
    ko: `  상태: ${result.status}`,
  }));

  if (result.issues.length > 0) {
    lines.push(localize(language, {
      zh: "  问题：",
      en: "  Issues:",
      ko: "  문제:",
    }));
    for (const issue of result.issues) {
      lines.push(`    [${issue.severity}] ${issue.category}: ${issue.description}`);
    }
  }

  return lines;
}

export function formatWriteNextComplete(language: CliLanguage): string {
  return localize(language, {
    zh: "完成。",
    en: "Done.",
    ko: "완료.",
  });
}

export function formatImportChaptersDiscovery(
  language: CliLanguage,
  chapterCount: number,
  bookId: string,
): string {
  return localize(language, {
    zh: `发现 ${chapterCount} 章，准备导入到「${bookId}」。`,
    en: `Found ${chapterCount} chapters to import into "${bookId}".`,
    ko: `${chapterCount}개 챕터를 발견했습니다. "${bookId}"에 가져옵니다.`,
  });
}

export function formatImportChaptersResume(
  language: CliLanguage,
  resumeFrom: number,
): string {
  return localize(language, {
    zh: `从第 ${resumeFrom} 章继续导入。`,
    en: `Resuming from chapter ${resumeFrom}.`,
    ko: `제${resumeFrom}화부터 가져오기를 재개합니다.`,
  });
}

export function formatImportChaptersComplete(
  language: CliLanguage,
  result: ImportResultShape,
): string[] {
  const lengthLabel = formatLengthCount(result.totalWords, resolveLengthCountingMode(language));
  return [
    localize(language, {
      zh: "导入完成：",
      en: "Import complete:",
      ko: "가져오기 완료:",
    }),
    localize(language, {
      zh: `  已导入章节：${result.importedCount}`,
      en: `  Chapters imported: ${result.importedCount}`,
      ko: `  가져온 챕터: ${result.importedCount}`,
    }),
    localize(language, {
      zh: `  总长度：${lengthLabel}`,
      en: `  Total length: ${lengthLabel}`,
      ko: `  총 글자수: ${lengthLabel}`,
    }),
    localize(language, {
      zh: `  下一章编号：${result.nextChapter}`,
      en: `  Next chapter number: ${result.nextChapter}`,
      ko: `  다음 화 번호: ${result.nextChapter}`,
    }),
    "",
    localize(language, {
      zh: `运行 "inkos write next ${result.continueBookId}" 继续写作。`,
      en: `Run "inkos write next ${result.continueBookId}" to continue writing.`,
      ko: `"inkos write next ${result.continueBookId}" 명령으로 계속 작성하세요.`,
    }),
  ];
}

export function formatImportCanonStart(
  language: CliLanguage,
  parentBookId: string,
  targetBookId: string,
): string {
  return localize(language, {
    zh: `把 "${parentBookId}" 的正典导入到 "${targetBookId}"...`,
    en: `Importing canon from "${parentBookId}" into "${targetBookId}"...`,
    ko: `"${parentBookId}"의 원전을 "${targetBookId}"에 가져오는 중...`,
  });
}

export function formatImportCanonComplete(language: CliLanguage): string[] {
  return [
    localize(language, {
      zh: "正典已导入：story/parent_canon.md",
      en: "Canon imported: story/parent_canon.md",
      ko: "원전 가져오기 완료: story/parent_canon.md",
    }),
    localize(language, {
      zh: "Writer 和 auditor 会在番外模式下自动识别这个文件。",
      en: "Writer and auditor will auto-detect this file for spinoff mode.",
      ko: "Writer와 auditor가 스핀오프 모드에서 이 파일을 자동으로 인식합니다.",
    }),
  ];
}
