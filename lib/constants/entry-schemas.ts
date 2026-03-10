// Entry type schemas ported from the Python backend (main.py).
// Single source of truth for AI entry generation and Kaizen form mapping.

import type { GeneratedEntryType } from "../types/entries";

export type EntryFieldType =
  | "string"
  | "text"
  | "date"
  | "select"
  | "boolean"
  | "integer";

export type EntryField = {
  id: string;
  label: string;
  type: EntryFieldType;
  required?: boolean;
  /** For select fields, the available options */
  options?: { value: string; label: string }[];
};

export type EntrySchema = {
  type: GeneratedEntryType;
  title: string;
  fields: EntryField[];
};

export const ENTRY_TYPE_SCHEMAS: Record<GeneratedEntryType, EntrySchema> = {
  reflection: {
    type: "reflection",
    title: "Reflective Practice",
    fields: [
      { id: "title", label: "Title", type: "string", required: true },
      { id: "what_happened", label: "What happened", type: "text", required: true },
      { id: "important_points", label: "Important points", type: "text", required: true },
      { id: "reflection", label: "Reflection", type: "text", required: true },
      {
        id: "record_of_discussion_or_action_plan",
        label: "Record of discussion / action plan",
        type: "text",
      },
      { id: "log_procedure", label: "Log procedure", type: "string" },
      { id: "date", label: "Date", type: "date", required: true },
    ],
  },

  procedure: {
    type: "procedure",
    title: "Procedure Log",
    fields: [
      {
        id: "level_of_supervision",
        label: "Level of supervision",
        type: "integer",
        required: true,
        options: [
          { value: "1", label: "1 – Observe" },
          { value: "2", label: "2 – Direct supervision" },
          { value: "3", label: "3 – Indirect supervision" },
          { value: "4", label: "4 – Independent with support" },
          { value: "5", label: "5 – Independent" },
        ],
      },
      { id: "description", label: "Description", type: "text", required: true },
      {
        id: "request_assessment",
        label: "Request assessment (OSATS)",
        type: "boolean",
      },
      { id: "date", label: "Date", type: "date", required: true },
    ],
  },

  cbd: {
    type: "cbd",
    title: "Case-based Discussion",
    fields: [
      { id: "title", label: "Title", type: "string", required: true },
      { id: "describe_the_event", label: "Describe the event", type: "text", required: true },
      { id: "trainee_analysis", label: "Trainee analysis", type: "text", required: true },
      { id: "trainee_learning_plan", label: "Trainee learning plan", type: "text", required: true },
      { id: "additional_actions", label: "Additional actions", type: "text" },
      {
        id: "assessor_additional_comments",
        label: "Assessor additional comments",
        type: "text",
      },
      { id: "trainee_reflection", label: "Trainee reflection", type: "text" },
      { id: "assessor", label: "Assessor email", type: "string" },
    ],
  },

  minicex: {
    type: "minicex",
    title: "Mini Clinical Evaluation Exercise",
    fields: [
      { id: "title", label: "Title", type: "string", required: true },
      { id: "describe_the_event", label: "Describe the event", type: "text", required: true },
      { id: "trainee_analysis", label: "Trainee analysis", type: "text", required: true },
      { id: "trainee_learning_plan", label: "Trainee learning plan", type: "text", required: true },
      { id: "additional_actions", label: "Additional actions", type: "text" },
      {
        id: "assessor_additional_comments",
        label: "Assessor additional comments",
        type: "text",
      },
      { id: "trainee_reflection", label: "Trainee reflection", type: "text" },
      { id: "assessor", label: "Assessor email", type: "string" },
    ],
  },

  notss: {
    type: "notss",
    title: "Non-Technical Skills for Surgeons",
    fields: [
      { id: "title", label: "Title", type: "string", required: true },
      { id: "number_of_beds", label: "Number of beds", type: "string" },
      { id: "number_of_patients", label: "Number of patients", type: "string" },
      { id: "situation_awareness", label: "Situation awareness", type: "text", required: true },
      { id: "decision_making", label: "Decision making", type: "text", required: true },
      {
        id: "communication_teamwork",
        label: "Communication & teamwork",
        type: "text",
        required: true,
      },
      { id: "leadership", label: "Leadership", type: "text", required: true },
      { id: "comments_by_trainee", label: "Comments by trainee", type: "text" },
      { id: "comments_by_assessor", label: "Comments by assessor", type: "text" },
      { id: "assessor", label: "Assessor email", type: "string" },
    ],
  },

  osats_formative: {
    type: "osats_formative",
    title: "OSATS (Formative)",
    fields: [
      {
        id: "clinical_details_and_complexity",
        label: "Clinical details & complexity",
        type: "text",
        required: true,
      },
      { id: "what_went_well", label: "What went well", type: "text", required: true },
      {
        id: "what_could_have_gone_better",
        label: "What could have gone better",
        type: "text",
        required: true,
      },
      { id: "learning_plan", label: "Learning plan", type: "text", required: true },
      {
        id: "assessor_additional_comments",
        label: "Assessor additional comments",
        type: "text",
      },
      { id: "trainee_reflection", label: "Trainee reflection", type: "text" },
      { id: "assessor", label: "Assessor email", type: "string" },
    ],
  },

  osats_summative: {
    type: "osats_summative",
    title: "OSATS (Summative)",
    fields: [
      {
        id: "clinical_details_and_complexity",
        label: "Clinical details & complexity",
        type: "text",
        required: true,
      },
      { id: "what_went_well", label: "What went well", type: "text", required: true },
      {
        id: "what_could_have_gone_better",
        label: "What could have gone better",
        type: "text",
        required: true,
      },
      { id: "learning_plan", label: "Learning plan", type: "text", required: true },
      {
        id: "assessor_additional_comments",
        label: "Assessor additional comments",
        type: "text",
      },
      { id: "trainee_reflection", label: "Trainee reflection", type: "text" },
      { id: "assessor", label: "Assessor email", type: "string" },
    ],
  },

  courses: {
    type: "courses",
    title: "Course / Conference",
    fields: [
      { id: "title", label: "Title", type: "string", required: true },
      { id: "date", label: "Date", type: "date", required: true },
      { id: "description", label: "Description", type: "text", required: true },
    ],
  },
};

// Kaizen form field IDs mapped per entry type.
// CBD field IDs are verified. All others are best-guess estimates based on
// Drupal's naming convention and may need correction after testing on live Kaizen.
export const KAIZEN_FORM_FIELDS: Partial<
  Record<GeneratedEntryType, Record<string, string>>
> = {
  reflection: {
    title: "edit-name-0-value",
    what_happened: "edit-field-assess-what-happened-0-value",
    important_points: "edit-field-assess-important-points-0-value",
    reflection: "edit-field-assess-reflection-0-value",
    record_of_discussion_or_action_plan:
      "edit-field-assess-record-of-discus-0-value",
    log_procedure: "edit-field-assess-log-procedure-0-value",
    date: "edit-event-date-0-value-date",
  },
  cbd: {
    title: "edit-name-0-value",
    describe_the_event: "edit-field-assess-event-description-0-value",
    trainee_analysis: "edit-field-assess-trainee-analysis-0-value",
    trainee_learning_plan: "edit-field-assess-trainee-learningpla-0-value",
    additional_actions: "edit-field-assess-additional-actions-0-value",
    trainee_reflection: "edit-field-assess-trainee-reflection-0-value",
    assessor_additional_comments:
      "edit-field-assessors-additional-comme-0-value",
    date: "edit-event-date-0-value-date",
    assessor:
      "edit-assessment-request-0-inline-entity-form-assessor-email-0-value",
  },
  minicex: {
    title: "edit-name-0-value",
    describe_the_event: "edit-field-assess-event-description-0-value",
    trainee_analysis: "edit-field-assess-trainee-analysis-0-value",
    trainee_learning_plan: "edit-field-assess-trainee-learningpla-0-value",
    additional_actions: "edit-field-assess-additional-actions-0-value",
    trainee_reflection: "edit-field-assess-trainee-reflection-0-value",
    assessor_additional_comments:
      "edit-field-assessors-additional-comme-0-value",
    date: "edit-event-date-0-value-date",
    assessor:
      "edit-assessment-request-0-inline-entity-form-assessor-email-0-value",
  },
  notss: {
    title: "edit-name-0-value",
    number_of_beds: "edit-field-assess-number-of-beds-0-value",
    number_of_patients: "edit-field-assess-number-of-patient-0-value",
    situation_awareness: "edit-field-assess-situation-awarene-0-value",
    decision_making: "edit-field-assess-decision-making-0-value",
    communication_teamwork: "edit-field-assess-communication-tea-0-value",
    leadership: "edit-field-assess-leadership-0-value",
    comments_by_trainee: "edit-field-assess-comments-by-train-0-value",
    comments_by_assessor: "edit-field-assess-comments-by-asses-0-value",
    assessor:
      "edit-assessment-request-0-inline-entity-form-assessor-email-0-value",
    date: "edit-event-date-0-value-date",
  },
  osats_formative: {
    clinical_details_and_complexity:
      "edit-field-assess-clinical-details-0-value",
    what_went_well: "edit-field-assess-what-went-well-0-value",
    what_could_have_gone_better: "edit-field-assess-what-could-have-0-value",
    learning_plan: "edit-field-assess-learning-plan-0-value",
    assessor_additional_comments:
      "edit-field-assessors-additional-comme-0-value",
    trainee_reflection: "edit-field-assess-trainee-reflection-0-value",
    assessor:
      "edit-assessment-request-0-inline-entity-form-assessor-email-0-value",
    date: "edit-event-date-0-value-date",
  },
  osats_summative: {
    clinical_details_and_complexity:
      "edit-field-assess-clinical-details-0-value",
    what_went_well: "edit-field-assess-what-went-well-0-value",
    what_could_have_gone_better: "edit-field-assess-what-could-have-0-value",
    learning_plan: "edit-field-assess-learning-plan-0-value",
    assessor_additional_comments:
      "edit-field-assessors-additional-comme-0-value",
    trainee_reflection: "edit-field-assess-trainee-reflection-0-value",
    assessor:
      "edit-assessment-request-0-inline-entity-form-assessor-email-0-value",
    date: "edit-event-date-0-value-date",
  },
  courses: {
    title: "edit-name-0-value",
    date: "edit-event-date-0-value-date",
    description: "edit-field-assess-description-0-value",
  },
  procedure: {
    description: "edit-field-assess-description-0-value",
    date: "edit-event-date-0-value-date",
  },
};

