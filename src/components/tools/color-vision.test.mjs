// Run: node --experimental-strip-types --test src/components/tools/color-vision.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { getTrials, summarizeVision, shuffle } from "./color-vision.ts";

function responsesFor(trials, difficultAxes = [], skippedAxes = []) {
  return trials.map((trial) => ({ trialId: trial.id, status: skippedAxes.includes(trial.axis) ? "skipped" : "answered", correct: !difficultAxes.includes(trial.axis), response: "test response" }));
}

test("each exercise set has controls and both color groups, with unique tasks", () => {
  for (const suite of ["complete", "plate", "match", "order"]) {
    const trials = getTrials(suite);
    assert.deepEqual(new Set(trials.map((trial) => trial.axis)), new Set(["control", "red-green", "blue-yellow"]));
    assert.equal(new Set(trials.map((trial) => trial.id)).size, trials.length);
  }
  assert.equal(getTrials("complete").length, 21);
  const items = [1, 2, 3, 4, 5];
  assert.deepEqual(shuffle(items, () => 0).toSorted(), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5]);
});

test("result describes observed color groups without inventing protan/deutan diagnoses", () => {
  const trials = getTrials("complete");
  const all = summarizeVision(trials, responsesFor(trials));
  assert.match(all.title, /All tasks matched/);
  assert.match(all.explanation, /does not rule out/);
  const rg = summarizeVision(trials, responsesFor(trials, ["red-green"]));
  assert.match(rg.title, /Red–green/);
  assert.match(rg.explanation, /cannot distinguish protan from deutan/);
  assert.equal(rg.scores[1].missed, 8);
  assert.equal(rg.scores[2].missed, 0);
  assert.match(summarizeVision(trials, responsesFor(trials, ["blue-yellow"])).title, /Blue–yellow/);
  assert.match(summarizeVision(trials, responsesFor(trials, ["red-green", "blue-yellow"])).title, /both color groups/);
});

test("failed controls override color interpretation; skips never count as difficulty", () => {
  const trials = getTrials("plate");
  const failedControl = summarizeVision(trials, responsesFor(trials, ["control", "red-green"]));
  assert.match(failedControl.title, /No reliable color pattern/);
  const skipped = summarizeVision(trials, responsesFor(trials, [], ["red-green"]));
  assert.match(skipped.title, /Incomplete/);
  assert.equal(skipped.scores[1].missed, 0);
  assert.equal(skipped.scores[1].skipped, 4);
  const none = summarizeVision(trials, []);
  assert.match(none.title, /No reliable/);
  const answers = responsesFor(trials);
  answers[1] = { ...answers[1], status: "unseen", correct: false };
  const unseen = summarizeVision(trials, answers);
  assert.equal(unseen.scores[1].missed, 1);
  assert.equal(unseen.scores[1].skipped, 0);
});
