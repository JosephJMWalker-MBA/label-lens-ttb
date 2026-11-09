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
