import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKaizenFillPayload,
  previewKaizenFill,
} from "../../lib/kaizen/fill-payload";

describe("buildKaizenFillPayload", () => {
  it("includes only mapped non-empty fields", () => {
    const payload = buildKaizenFillPayload("reflection", {
      title: "Emergency LSCS",
      what_happened: "Fetal bradycardia at 8cm.",
      important_points: "",
      reflection: "Learned about consent timing.",
      date: "2026-05-20",
      log_procedure: "",
    });

    assert.equal(payload.entry_type, "reflection");
    assert.deepEqual(payload.fields, {
      title: "Emergency LSCS",
      what_happened: "Fetal bradycardia at 8cm.",
      reflection: "Learned about consent timing.",
      date: "2026-05-20",
    });
    assert.deepEqual(payload.key_skills, []);
  });

  it("queues key skills with Kaizen display tokens", () => {
    const payload = buildKaizenFillPayload(
      "reflection",
      { title: "Case", what_happened: "Event", reflection: "Learned", date: "2026-05-20" },
      [
        {
          key_skill_id: "ks-1",
          title: "Manages emergency birth",
          cip_number: 10,
          kaizen_ids: ["12345"],
        },
      ],
    );

    assert.equal(payload.key_skills.length, 1);
    assert.equal(
      payload.key_skills[0]?.display_value,
      "Manages emergency birth (12345)",
    );
  });

  it("normalises dates and skips false booleans", () => {
    const payload = buildKaizenFillPayload("procedure", {
      level_of_supervision: "3",
      description: "Assisted LSCS",
      request_assessment: "false",
      date: "20/05/2026",
    });

    assert.equal(payload.fields.level_of_supervision, "3");
    assert.equal(payload.fields.description, "Assisted LSCS");
    assert.equal(payload.fields.date, "2026-05-20");
    assert.equal(payload.fields.request_assessment, undefined);
  });
});

describe("previewKaizenFill", () => {
  it("flags missing required mapped fields", () => {
    const preview = previewKaizenFill("cbd", {
      title: "Case discussion",
      date: "",
      describe_the_event: "Event text",
      trainee_analysis: "",
      trainee_learning_plan: "",
    });

    assert.ok(preview.missingRequired.some((f) => f.id === "date"));
    assert.equal(preview.includedFieldCount, 2);
  });
});
