export type ColorAxis = "control" | "red-green" | "blue-yellow";
export type TestKind = "plate" | "match" | "order";
export type TestSuite = "complete" | TestKind;

export interface VisionTrial {
  id: string;
  kind: TestKind;
  axis: ColorAxis;
  digit?: string;
  foreground?: string[];
  background?: string[];
  colors: string[];
  target?: number;
}

export interface VisionResponse {
  trialId: string;
  status: "answered" | "unseen" | "skipped";
  correct: boolean;
  response: string;
}

export interface AxisScore {
  axis: ColorAxis;
  total: number;
  answered: number;
  correct: number;
  missed: number;
  skipped: number;
}

export const axisLabels: Record<ColorAxis, string> = {
  control: "Control / visibility",
  "red-green": "Red–green distinction",
  "blue-yellow": "Blue–yellow distinction",
};

export const kindLabels: Record<TestKind, string> = {
  plate: "Number plates",
  match: "Color matching",
  order: "Hue ordering",
};

const palettePairs: Record<ColorAxis, [string[], string[]]> = {
  control: [["#ededed", "#dadada", "#ffffff"], ["#454545", "#555555", "#333333"]],
  "red-green": [["#bd775e", "#a96852", "#cd876c"], ["#8c935c", "#788452", "#a0a268"]],
  "blue-yellow": [["#778cbd", "#677dab", "#8c9fca"], ["#ada264", "#9c9257", "#c0b575"]],
};

// These are custom browser exercises, not validated Ishihara/HRR/D-15 plates.
const trials: VisionTrial[] = [
  ...(["control", "red-green", "blue-yellow", "red-green", "blue-yellow", "control", "red-green", "blue-yellow", "red-green", "blue-yellow"] as ColorAxis[]).map((axis, index) => ({
    id: `plate-${index + 1}`, kind: "plate" as const, axis,
    digit: ["12", "8", "5", "29", "74", "6", "3", "9", "16", "42"][index],
    foreground: palettePairs[axis][index % 2], background: palettePairs[axis][1 - index % 2], colors: [],
  })),
  ...([
    { axis: "control", colors: ["#333333", "#777777", "#bbbbbb", "#eeeeee"], target: 2 },
    { axis: "red-green", colors: ["#a17c58", "#938453", "#828b57", "#71905e"], target: 1 },
    { axis: "blue-yellow", colors: ["#808dab", "#8c90a0", "#999393", "#a59884"], target: 2 },
    { axis: "red-green", colors: ["#b9786b", "#a98165", "#95895f", "#809161"], target: 0 },
    { axis: "blue-yellow", colors: ["#748fbc", "#8994ab", "#9e9897", "#b09d81"], target: 3 },
    { axis: "control", colors: ["#eeeeee", "#aaaaaa", "#666666", "#222222"], target: 2 },
    { axis: "red-green", colors: ["#a17e65", "#998260", "#8e865f", "#858a61"], target: 2 },
    { axis: "blue-yellow", colors: ["#8b91a6", "#92939e", "#999697", "#a0988e"], target: 1 },
  ] as { axis: ColorAxis; colors: string[]; target: number }[]).map((entry, index) => ({
    ...entry, id: `match-${index + 1}`, kind: "match" as const,
  })),
  { id: "order-control", kind: "order", axis: "control", colors: ["#222222", "#444444", "#666666", "#888888", "#aaaaaa", "#cccccc", "#eeeeee"] },
  { id: "order-red-green", kind: "order", axis: "red-green", colors: ["#bc796d", "#b37d66", "#a98260", "#9d875c", "#8e8c5b", "#7f905f", "#709365"] },
  { id: "order-blue-yellow", kind: "order", axis: "blue-yellow", colors: ["#748fbc", "#8092b4", "#8d95a9", "#99979b", "#a49a8e", "#ae9d81", "#b89f72"] },
];

export function getTrials(suite: TestSuite): VisionTrial[] {
  return trials.filter((trial) => suite === "complete" || trial.kind === suite);
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function summarizeVision(activeTrials: VisionTrial[], responses: VisionResponse[]) {
  const scores: AxisScore[] = (["control", "red-green", "blue-yellow"] as ColorAxis[]).map((axis) => {
    const relevant = activeTrials.filter((trial) => trial.axis === axis);
    const answers = relevant.map((trial) => responses.find((answer) => answer.trialId === trial.id));
    const answered = answers.filter((answer) => answer && answer.status !== "skipped").length;
    const correct = answers.filter((answer) => answer?.status === "answered" && answer.correct).length;
    return { axis, total: relevant.length, answered, correct, missed: answered - correct, skipped: relevant.length - answered };
  });
  const [control, redGreen, blueYellow] = scores;
  const incomplete = scores.some((score) => score.skipped > 0);
  let title: string;
  let explanation: string;
  if (control.missed > 0 || control.answered === 0) {
    title = "No reliable color pattern from this session";
    explanation = "At least one visibility/control task was missed or no control task was completed. Display conditions, number readability, or task instructions may explain the result. Check your setup and repeat before interpreting the color tasks.";
  } else if (incomplete) {
    title = "Incomplete color profile";
    explanation = "Skipped tasks are not counted as color errors. Complete all tasks to compare the two color groups; the counts below describe only the responses you gave.";
  } else if (redGreen.missed > 0 && blueYellow.missed > 0) {
    title = "Difficulty in both color groups";
    explanation = "This session includes errors on both red–green and blue–yellow tasks. That is not a specific deficiency pattern: display conditions, attention, and the custom exercise design can also produce these results.";
  } else if (redGreen.missed > 0) {
    title = "Red–green distinction was harder in this session";
    explanation = "Errors were limited to red–green tasks. Red–green color vision deficiencies include protan (red-sensitive) and deutan (green-sensitive) types. These custom exercises cannot distinguish protan from deutan, or tell reduced sensitivity from an absent response.";
  } else if (blueYellow.missed > 0) {
    title = "Blue–yellow distinction was harder in this session";
    explanation = "Errors were limited to blue–yellow tasks. Blue–yellow color vision deficiency is often called tritan-type. A few errors in these custom exercises do not establish that condition or its severity.";
  } else {
    title = "All tasks matched in this session";
    explanation = "You matched every target in these exercises. This does not rule out a color vision deficiency; these browser-generated tasks are not a validated clinical screening test.";
  }
  return { scores, title, explanation, incomplete };
}
