import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateArcpCountdown,
  sanitizeWorkingPercent,
} from "../../lib/profile/ltft";
import {
  calculateProRataProgress,
  calculateKeySkillsProRataCheckpoint,
  getStageWindowForProgress,
} from "../../lib/profile/ltft-pro-rata";
import { stagesForScope } from "../../lib/profile/stage";

test("sanitizeWorkingPercent clamps and rounds safely", () => {
  assert.equal(sanitizeWorkingPercent(80), 80);
  assert.equal(sanitizeWorkingPercent("79.8"), 79);
  assert.equal(sanitizeWorkingPercent(0), 10);
  assert.equal(sanitizeWorkingPercent(101), 100);
  assert.equal(sanitizeWorkingPercent("oops"), 100);
});

test("calculateArcpCountdown returns expected calendar and WTE days", () => {
  const nowMs = Date.UTC(2026, 2, 22, 0, 0, 0); // 2026-03-22
  const arcpDate = "2026-06-01";

  const full = calculateArcpCountdown(arcpDate, 100, nowMs);
  assert.equal(full.calendarDaysToArcp, 71);
  assert.equal(full.wteDaysToArcp, 71);
  assert.equal(full.isLtft, false);

  const ltft80 = calculateArcpCountdown(arcpDate, 80, nowMs);
  assert.equal(ltft80.calendarDaysToArcp, 71);
  assert.equal(ltft80.wteDaysToArcp, 57);
  assert.equal(ltft80.isLtft, true);

  const ltft60 = calculateArcpCountdown(arcpDate, 60, nowMs);
  assert.equal(ltft60.wteDaysToArcp, 43);
});

test("stage windows map to aligned stage bands", () => {
  const st1 = getStageWindowForProgress("ST1");
  assert.deepEqual(st1, {
    label: "Stage 1 (ST1-2)",
    durationYears: 2,
    completedYearsBeforeCurrent: 0,
  });

  const st5 = getStageWindowForProgress("ST5");
  assert.deepEqual(st5, {
    label: "Stage 2 (ST3-5)",
    durationYears: 3,
    completedYearsBeforeCurrent: 2,
  });

  const st7 = getStageWindowForProgress("ST7");
  assert.deepEqual(st7, {
    label: "Stage 3 (ST6-7)",
    durationYears: 2,
    completedYearsBeforeCurrent: 1,
  });
});

test("key skill pro-rata checkpoint matches expected thresholds for 100/80/60", () => {
  const base = {
    totalSkills: 75,
    confirmedSkills: 67,
    currentStage: "ST1",
    daysToArcpCalendar: 71,
  };

  const p100 = calculateKeySkillsProRataCheckpoint({
    ...base,
    workingPercentInput: 100,
  });
  assert.equal(p100.expectedByNowThreshold, 31);
  assert.equal(p100.expectedByNowRounded, 30.2);
  assert.equal(p100.onTrack, true);

  const p80 = calculateKeySkillsProRataCheckpoint({
    ...base,
    workingPercentInput: 80,
  });
  assert.equal(p80.expectedByNowThreshold, 25);
  assert.equal(p80.expectedByNowRounded, 24.2);
  assert.equal(p80.onTrack, true);

  const p60 = calculateKeySkillsProRataCheckpoint({
    ...base,
    workingPercentInput: 60,
  });
  assert.equal(p60.expectedByNowThreshold, 19);
  assert.equal(p60.expectedByNowRounded, 18.1);
  assert.equal(p60.onTrack, true);
});

test("pro-rata checkpoint handles missing ARCP date without false expectations", () => {
  const result = calculateKeySkillsProRataCheckpoint({
    totalSkills: 75,
    confirmedSkills: 67,
    currentStage: "ST1",
    daysToArcpCalendar: null,
    workingPercentInput: 80,
  });

  assert.equal(result.expectedByNowThreshold, null);
  assert.equal(result.expectedByNowRounded, null);
  assert.equal(result.onTrack, null);
});

test("generic pro-rata progress utility computes thresholds and status", () => {
  const result = calculateProRataProgress({
    total: 10,
    actual: 4,
    stageElapsedFraction: 0.5,
    workingPercentInput: 80,
  });

  // expectedRaw = 10 * 0.5 * 0.8 = 4
  assert.equal(result.expectedRounded, 4);
  assert.equal(result.expectedThreshold, 4);
  assert.equal(result.onTrack, true);

  const below = calculateProRataProgress({
    total: 10,
    actual: 3,
    stageElapsedFraction: 0.5,
    workingPercentInput: 80,
  });
  assert.equal(below.onTrack, false);
});

test("stage scope mapping resolves aligned bands", () => {
  assert.deepEqual(stagesForScope("BAND_ST1_2"), ["ST1", "ST2"]);
  assert.deepEqual(stagesForScope("BAND_ST3_5"), ["ST3", "ST4", "ST5"]);
  assert.deepEqual(stagesForScope("BAND_ST6_7"), ["ST6", "ST7"]);
  assert.equal(stagesForScope("Stage One"), null);
});
