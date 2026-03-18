import type {
  AttributionStatus,
  ReviewEntry,
  SkillSuggestion,
} from "@/lib/types/key-skill-review";

function makeSuggestion(
  overrides: Partial<SkillSuggestion> & {
    key_skill_id: string;
    cip_number: number;
    key_skill_title: string;
  },
): SkillSuggestion {
  const base: SkillSuggestion = {
    key_skill_id: overrides.key_skill_id,
    cip_number: overrides.cip_number,
    key_skill_title: overrides.key_skill_title,
    confidence: 0.75,
    rationale: "Mock rationale describing why this key skill may apply.",
    status: "suggested",
    source: "linked_cip",
  };

  return { ...base, ...overrides };
}

function status(status: AttributionStatus): AttributionStatus {
  return status;
}

export const mockKeySkillReviewEntries: ReviewEntry[] = [
  {
    id: "e1",
    title: "Managing postpartum haemorrhage in theatre",
    entry_type: "CBD",
    linked_cip_number: 13,
    date: "2025-11-03",
    raw_text:
      "Led the multidisciplinary response to a severe postpartum haemorrhage, coordinating anaesthetics, theatre staff, and blood bank.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-13-1",
        cip_number: 13,
        key_skill_title: "Leads obstetric emergency response",
        confidence: 0.92,
        rationale:
          "Describes leading a multidisciplinary team in an acute obstetric emergency.",
        status: status("confirmed"),
        source: "linked_cip",
      }),
      makeSuggestion({
        key_skill_id: "ks-13-2",
        cip_number: 13,
        key_skill_title: "Escalates appropriately to senior support",
        confidence: 0.68,
        rationale:
          "Mentions liaison with consultant staff but wording is indirect.",
        status: status("suggested"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-6-1",
        cip_number: 6,
        key_skill_title: "Demonstrates leadership in complex situations",
        confidence: 0.8,
        rationale:
          "Shows coordination across teams and anticipatory decision-making.",
        status: status("suggested"),
        source: "cross_cip",
      }),
    ],
  },
  {
    id: "e2",
    title: "Breaking bad news in antenatal clinic",
    entry_type: "CBD",
    linked_cip_number: 5,
    date: "2025-10-21",
    raw_text:
      "Consultation with a couple following diagnosis of fetal anomaly, including options counselling and documentation.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-5-1",
        cip_number: 5,
        key_skill_title: "Communicates complex information with empathy",
        confidence: 0.88,
        rationale:
          "Describes sensitive consultation and shared decision-making discussion.",
        status: status("suggested"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-1-1",
        cip_number: 1,
        key_skill_title: "Maintains accurate contemporaneous records",
        confidence: 0.72,
        rationale: "Highlights thorough documentation of the consultation.",
        status: status("rejected"),
        source: "cross_cip",
      }),
    ],
  },
  {
    id: "e3",
    title: "Laparoscopic management of ectopic pregnancy",
    entry_type: "OSATS",
    linked_cip_number: 8,
    date: "2025-09-09",
    raw_text:
      "Performed laparoscopic salpingectomy under supervision, including port placement, haemostasis and specimen retrieval.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-8-1",
        cip_number: 8,
        key_skill_title: "Performs laparoscopic salpingectomy safely",
        confidence: 0.94,
        rationale:
          "Details all critical steps of the procedure completed independently.",
        status: status("confirmed"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-2-1",
        cip_number: 2,
        key_skill_title: "Uses minimally invasive approaches where appropriate",
        confidence: 0.79,
        rationale:
          "Choice of laparoscopy reflects minimally invasive decision-making.",
        status: status("suggested"),
        source: "cross_cip",
      }),
    ],
  },
  {
    id: "e4",
    title: "Managing induction of labour for IUGR",
    entry_type: "CBD",
    linked_cip_number: 10,
    date: "2025-08-15",
    raw_text:
      "Risk assessment and counselling for induction of labour in the context of intrauterine growth restriction.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-10-1",
        cip_number: 10,
        key_skill_title: "Balances maternal and fetal risks in decision-making",
        confidence: 0.83,
        rationale:
          "Discusses complex risk–benefit considerations with the woman.",
        status: status("suggested"),
        source: "linked_cip",
      }),
      makeSuggestion({
        key_skill_id: "ks-10-2",
        cip_number: 10,
        key_skill_title: "Plans intrapartum surveillance appropriately",
        confidence: 0.65,
        rationale:
          "Brief mention of CTG planning but lacking detailed description.",
        status: status("rejected"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-4-1",
        cip_number: 4,
        key_skill_title: "Works effectively with fetal medicine team",
        confidence: 0.7,
        rationale: "Refers to liaison with fetal medicine but not central.",
        status: status("suggested"),
        source: "cross_cip",
      }),
    ],
  },
  {
    id: "e5",
    title: "Debrief after emergency caesarean section",
    entry_type: "CBD",
    linked_cip_number: 13,
    date: "2025-07-02",
    raw_text:
      "Postnatal debrief with woman and partner following Category 1 caesarean section for fetal distress.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-13-3",
        cip_number: 13,
        key_skill_title: "Provides structured post-event debrief",
        confidence: 0.81,
        rationale:
          "Focuses on explanation of events, validation of concerns, and follow-up plan.",
        status: status("confirmed"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-5-2",
        cip_number: 5,
        key_skill_title: "Addresses psychological impact of obstetric events",
        confidence: 0.69,
        rationale:
          "Touches on emotional impact but largely centred on factual explanation.",
        status: status("suggested"),
        source: "cross_cip",
      }),
    ],
  },
  {
    id: "e6",
    title: "Outpatient hysteroscopy for abnormal bleeding",
    entry_type: "OSATS",
    linked_cip_number: 9,
    date: "2025-06-11",
    raw_text:
      "Diagnostic outpatient hysteroscopy using vaginoscopic technique with endometrial biopsy.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-9-1",
        cip_number: 9,
        key_skill_title: "Performs outpatient hysteroscopy competently",
        confidence: 0.86,
        rationale:
          "Documents full procedure with appropriate analgesia and consent.",
        status: status("suggested"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-3-1",
        cip_number: 3,
        key_skill_title: "Optimises use of outpatient services",
        confidence: 0.77,
        rationale:
          "Highlights avoidance of inpatient admission and general anaesthetic.",
        status: status("rejected"),
        source: "cross_cip",
      }),
    ],
  },
  {
    id: "e7",
    title: "Teaching session on CTG interpretation",
    entry_type: "TO",
    linked_cip_number: 6,
    date: "2025-05-04",
    raw_text:
      "Delivered small-group teaching for midwives and junior doctors on CTG interpretation using real cases.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-6-2",
        cip_number: 6,
        key_skill_title: "Contributes to multidisciplinary teaching",
        confidence: 0.9,
        rationale:
          "Describes structured teaching with interactive case discussion.",
        status: status("confirmed"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-1-2",
        cip_number: 1,
        key_skill_title: "Supports learning of junior colleagues",
        confidence: 0.73,
        rationale:
          "Focuses on developing CTG interpretation skills in the wider team.",
        status: status("suggested"),
        source: "cross_cip",
      }),
    ],
  },
  {
    id: "e8",
    title: "On-call triage of acute gynaecology referrals",
    entry_type: "CBD",
    linked_cip_number: 7,
    date: "2025-04-18",
    raw_text:
      "Reviewed multiple unscheduled gynaecology referrals, prioritising assessment and arranging appropriate imaging.",
    linked_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-7-1",
        cip_number: 7,
        key_skill_title: "Prioritises unscheduled gynaecology workload",
        confidence: 0.78,
        rationale:
          "Demonstrates triage decisions and safe management planning.",
        status: status("suggested"),
        source: "linked_cip",
      }),
    ],
    cross_cip_suggestions: [
      makeSuggestion({
        key_skill_id: "ks-2-2",
        cip_number: 2,
        key_skill_title: "Uses investigation pathways appropriately",
        confidence: 0.82,
        rationale:
          "Describes rational ordering of imaging and follow-up appointments.",
        status: status("confirmed"),
        source: "cross_cip",
      }),
    ],
  },
];

