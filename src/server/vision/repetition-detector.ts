/**
 * Deterministic repetition detector for vision reader transcripts.
 *
 * Autoregressive vision-language models at temperature 0 can occasionally enter
 * degenerate repetition loops (e.g., repeating a single token or n-gram until
 * max_tokens). This utility deterministically identifies and rejects such
 * malformed outputs before they reach downstream entity selectors.
 */

export interface RepetitionCheckResult {
  isDegenerate: boolean;
  reason?: "CONSECUTIVE_UNIGRAM" | "CONSECUTIVE_NGRAM" | "LOW_VOCABULARY_DIVERSITY";
  repeatedToken?: string;
  repeatCount?: number;
}

/**
 * Checks a single string for degenerate repetition artifacts (unigram, ngram, or vocabulary collapse).
 */
export function detectDegenerateRepetition(text: string): RepetitionCheckResult {
  if (!text || text.trim() === "") {
    return { isDegenerate: false };
  }

  // Split into whitespace-delimited word tokens, preserving Unicode letters
  const words = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length < 4) {
    return { isDegenerate: false };
  }

  // 1. Consecutive unigram check: any word repeating >= 4 times consecutively without interruption
  let currentRunToken = words[0];
  let currentRunCount = 1;

  for (let i = 1; i < words.length; i++) {
    if (words[i] === currentRunToken) {
      currentRunCount++;
      if (currentRunCount >= 4) {
        return {
          isDegenerate: true,
          reason: "CONSECUTIVE_UNIGRAM",
          repeatedToken: currentRunToken,
          repeatCount: currentRunCount,
        };
      }
    } else {
      currentRunToken = words[i];
      currentRunCount = 1;
    }
  }

  // 2. Consecutive bigram check: any 2-word phrase repeating >= 3 times consecutively
  if (words.length >= 6) {
    for (let i = 0; i <= words.length - 6; i++) {
      const b1 = `${words[i]} ${words[i + 1]}`;
      const b2 = `${words[i + 2]} ${words[i + 3]}`;
      const b3 = `${words[i + 4]} ${words[i + 5]}`;
      if (b1 === b2 && b2 === b3) {
        return {
          isDegenerate: true,
          reason: "CONSECUTIVE_NGRAM",
          repeatedToken: b1,
          repeatCount: 3,
        };
      }
    }
  }

  // 3. Consecutive trigram check: any 3-word phrase repeating >= 3 times consecutively
  if (words.length >= 9) {
    for (let i = 0; i <= words.length - 9; i++) {
      const t1 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const t2 = `${words[i + 3]} ${words[i + 4]} ${words[i + 5]}`;
      const t3 = `${words[i + 6]} ${words[i + 7]} ${words[i + 8]}`;
      if (t1 === t2 && t2 === t3) {
        return {
          isDegenerate: true,
          reason: "CONSECUTIVE_NGRAM",
          repeatedToken: t1,
          repeatCount: 3,
        };
      }
    }
  }

  // 4. Low vocabulary diversity: for lines with >= 10 words, unique ratio < 0.25
  if (words.length >= 10) {
    const unique = new Set(words);
    const ratio = unique.size / words.length;
    if (ratio < 0.25) {
      return {
        isDegenerate: true,
        reason: "LOW_VOCABULARY_DIVERSITY",
        repeatCount: words.length - unique.size,
      };
    }
  }

  return { isDegenerate: false };
}

/**
 * Checks an array of lines for both per-line and cross-line degenerate repetition loops.
 *
 * This detects:
 *   1. Degenerate repetition within any individual line.
 *   2. Runaway consecutive identical lines (>= 3 consecutive repeats).
 *   3. Multi-line vocabulary collapse across the transcript.
 *   4. Full-transcript joined sequence repetition across line boundaries.
 */
export function detectDegenerateTranscript(lines: readonly string[]): RepetitionCheckResult {
  if (!lines || lines.length === 0) {
    return { isDegenerate: false };
  }

  // 1. Check each line individually
  for (const line of lines) {
    const single = detectDegenerateRepetition(line);
    if (single.isDegenerate) {
      return single;
    }
  }

  const normalizedLines = lines.map((l) => l.trim().toLowerCase()).filter((l) => l.length > 0);

  if (normalizedLines.length === 0) {
    return { isDegenerate: false };
  }

  // 2. Check for consecutive identical lines (>= 3 repeats)
  let runLine = normalizedLines[0];
  let runCount = 1;
  for (let i = 1; i < normalizedLines.length; i++) {
    if (normalizedLines[i] === runLine) {
      runCount++;
      if (runCount >= 3) {
        return {
          isDegenerate: true,
          reason: "CONSECUTIVE_NGRAM",
          repeatedToken: runLine,
          repeatCount: runCount,
        };
      }
    } else {
      runLine = normalizedLines[i];
      runCount = 1;
    }
  }

  // 3. Multi-line low diversity (e.g. 60 lines with < 25% unique lines)
  if (normalizedLines.length >= 6) {
    const uniqueLines = new Set(normalizedLines);
    if (uniqueLines.size / normalizedLines.length < 0.25) {
      return {
        isDegenerate: true,
        reason: "LOW_VOCABULARY_DIVERSITY",
        repeatCount: normalizedLines.length - uniqueLines.size,
      };
    }
  }

  // 4. Joined full-transcript check (cross-boundary phrase loops)
  const fullText = lines.join(" ");
  const fullCheck = detectDegenerateRepetition(fullText);
  if (fullCheck.isDegenerate) {
    return fullCheck;
  }

  return { isDegenerate: false };
}
