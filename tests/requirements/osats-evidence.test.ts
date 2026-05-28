import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOsatsCountsByProcedure,
  inferAssessorRoleId,
  inferOsatsProcedureId,
  KAIZEN_CONSULTANT_ROLE_ID,
  resolveOsatsStorageFields,
} from "../../lib/requirements/osats-evidence";

const catalog = [
  { kaizen_id: 463, name: "Caesarean section (basic)" },
  { kaizen_id: 452, name: "Surgical management of miscarriage or surgical termination of pregnancy < 16 weeks" },
];

describe("inferOsatsProcedureId", () => {
  it("matches numeric procedure codes", () => {
    const id = inferOsatsProcedureId(
      {
        extracted_fields: { "procedure (value 1)": "Caesarean section (basic) (463)" },
      },
      catalog,
    );
    assert.equal(id, 463);
  });

  it("matches procedure names without numeric codes", () => {
    const id = inferOsatsProcedureId(
      {
        extracted_fields: { procedure: "Caesarean section (basic)" },
      },
      catalog,
    );
    assert.equal(id, 463);
  });
});

describe("inferAssessorRoleId", () => {
  it("maps consultant text roles to Kaizen consultant role id", () => {
    const id = inferAssessorRoleId({
      extracted_fields: { "assessor's role": "Consultant" },
    });
    assert.equal(id, KAIZEN_CONSULTANT_ROLE_ID);
  });
});

describe("buildOsatsCountsByProcedure", () => {
  it("counts Romana-style basic CS and Wong consultant sign-off", () => {
    const counts = buildOsatsCountsByProcedure(
      [
        {
          detected_entry_type: "osats_summative",
          extracted_fields: {
            procedure: "Caesarean section (basic)",
            "assessor's role": "Doctor",
          },
        },
        {
          detected_entry_type: "osats_summative",
          extracted_fields: {
            "procedure (value 1)": "Caesarean section (basic) (463)",
            "assessor's role": "Consultant",
          },
        },
      ],
      catalog,
      KAIZEN_CONSULTANT_ROLE_ID,
    );

    assert.equal(counts[463]?.total, 2);
    assert.equal(counts[463]?.consultant, 1);
  });
});

describe("resolveOsatsStorageFields", () => {
  it("overrides invalid stored procedure ids using catalog name match", () => {
    const resolved = resolveOsatsStorageFields(
      {
        detected_entry_type: "osats_summative",
        kaizen_procedure_id: 16,
        extracted_fields: {
          procedure:
            "Surgical management of miscarriage or surgical termination of pregnancy < 16 weeks",
        },
      },
      catalog,
    );

    assert.equal(resolved.kaizen_procedure_id, 452);
  });

  it("prefers consultant text over missing stored role id", () => {
    const resolved = resolveOsatsStorageFields(
      {
        detected_entry_type: "osats_summative",
        kaizen_procedure_id: 463,
        assessor_role_id: null,
        extracted_fields: {
          "procedure (value 1)": "Caesarean section (basic) (463)",
          "assessor's role": "Consultant",
        },
      },
      catalog,
    );

    assert.equal(resolved.kaizen_procedure_id, 463);
    assert.equal(resolved.assessor_role_id, KAIZEN_CONSULTANT_ROLE_ID);
  });
});
