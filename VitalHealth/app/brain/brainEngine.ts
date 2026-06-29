// app/brain/brainEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cognitive Engine — scoring, grading, difficulty, and result analysis
// ─────────────────────────────────────────────────────────────────────────────

export type Difficulty = "easy" | "medium" | "hard";

export type GameResult = {
  game:      "pattern" | "reaction" | "memory" | "stroop" | "cpt" | "flanker" | "nback" | "symbol" | "trail" | "switching";
  score:     number;     // 0–100 normalised
  rawScore:  number;     // actual points earned
  accuracy:  number;     // 0–1
  avgTimeMs: number;     // average response time in ms
  label:     string;     // human readable game name
};

export type BrainReport = {
  results:        GameResult[];
  overallScore:   number;   // 0–100
  grade:          string;   // S / A / B / C / D
  gradeColor:     string;
  dominantSkill:  string;
  weakestSkill:   string;
  insight:        string;
};

// ─── Difficulty ladder ────────────────────────────────────────────────────────
export function getDifficulty(score: number): Difficulty {
  if (score < 40) return "easy";
  if (score < 70) return "medium";
  return "hard";
}

// ─── Normalise raw scores to 0–100 ───────────────────────────────────────────
export function normaliseScore(raw: number, max: number): number {
  return Math.min(100, Math.max(0, Math.round((raw / max) * 100)));
}

// ─── Grade from overall score ─────────────────────────────────────────────────
export function getGrade(score: number): { grade: string; color: string; label: string } {
  if (score >= 90) return { grade: "S",  color: "#f59e0b", label: "Exceptional" };
  if (score >= 75) return { grade: "A",  color: "#22c55e", label: "Excellent"   };
  if (score >= 60) return { grade: "B",  color: "#38bdf8", label: "Good"        };
  if (score >= 45) return { grade: "C",  color: "#a78bfa", label: "Average"     };
  if (score >= 30) return { grade: "D",  color: "#f97316", label: "Below Avg"   };
  return                   { grade: "F",  color: "#ef4444", label: "Needs Work"  };
}

// ─── Reaction time scoring (ms → 0–100) ──────────────────────────────────────
// Elite: <200ms, Good: 200–350ms, Average: 350–500ms, Slow: >500ms
export function scoreReactionTime(avgMs: number): number {
  if (avgMs <= 0)    return 0;
  if (avgMs <= 200)  return 100;
  if (avgMs <= 350)  return 85;
  if (avgMs <= 500)  return 65;
  if (avgMs <= 700)  return 45;
  if (avgMs <= 1000) return 25;
  return 10;
}

// ─── Memory span scoring ──────────────────────────────────────────────────────
// Digit span: avg human = 7±2. Score based on max span reached.
export function scoreMemorySpan(maxSpan: number): number {
  if (maxSpan >= 10) return 100;
  if (maxSpan >= 8)  return 85;
  if (maxSpan >= 7)  return 70;
  if (maxSpan >= 6)  return 55;
  if (maxSpan >= 5)  return 40;
  if (maxSpan >= 4)  return 25;
  return 10;
}

// ─── Build brain report from all game results ─────────────────────────────────
export function buildReport(results: GameResult[]): BrainReport {
  if (results.length === 0) {
    return {
      results: [],
      overallScore: 0,
      grade: "F",
      gradeColor: "#ef4444",
      dominantSkill: "None",
      weakestSkill: "None",
      insight: "No cognitive assessment data found.",
    };
  }

  const overallScore = Math.round(
    results.reduce((s, r) => s + r.score, 0) / results.length
  );

  const { grade, color: gradeColor } = getGrade(overallScore);

  const best   = results.reduce((a, b) => (a.score > b.score ? a : b));
  const worst  = results.reduce((a, b) => (a.score < b.score ? a : b));

  const insights: Record<string, string> = {
    pattern:   "Your visual pattern recognition is your cognitive edge.",
    reaction:  "Your reflexes are sharp — excellent neural response speed.",
    memory:    "Your sequence recall capacity stands out.",
    stroop:    "Your cognitive control and focus are highly developed.",
    cpt:       "Your sustained attention over time is outstanding.",
    flanker:   "Your selective focus is brilliant under distraction.",
    nback:     "Your working memory retention is superior.",
    symbol:    "Your visual-motor processing speed is excellent.",
    trail:     "Your set-shifting and executive control are highly optimal.",
    switching: "Your mental adaptability and rule-shifting are supreme.",
  };

  const weakInsights: Record<string, string> = {
    pattern:   "Visual pattern recognition needs more training.",
    reaction:  "Reaction speed has room to grow with practice.",
    memory:    "Working memory can be improved with daily exercises.",
    stroop:    "Cognitive control under interference needs work.",
    cpt:       "Sustained concentration can be built with focus exercises.",
    flanker:   "Selective attention can improve with mindfulness/attention training.",
    nback:     "Working memory retention can be expanded with daily puzzles.",
    symbol:    "Visual processing coordination can be enhanced.",
    trail:     "Mental planning and sequencing can be improved.",
    switching: "Task switching flexibility can be sharpened.",
  };

  return {
    results,
    overallScore,
    grade,
    gradeColor,
    dominantSkill: best.label,
    weakestSkill:  worst.label,
    insight: overallScore >= 60
      ? insights[best.game] || "You show strong cognitive functions across domains."
      : weakInsights[worst.game] || "Regular practice can improve cognitive skills.",
  };
}

// ─── Game labels ──────────────────────────────────────────────────────────────
export const GAME_LABELS: Record<string, string> = {
  pattern:   "Pattern Memory",
  reaction:  "Reaction Speed",
  memory:    "Working Memory",
  stroop:    "Stroop Focus",
  cpt:       "Sustained Attention",
  flanker:   "Selective Attention",
  nback:     "Working Memory",
  symbol:    "Processing Speed",
  trail:     "Executive Function",
  switching: "Task Switching",
};