#!/usr/bin/env python3
"""Generate migration SQL for CiP 10-14 descriptors (Kaizen-confirmed)."""

from __future__ import annotations

from pathlib import Path

# legacy_id -> list of descriptor texts (sort_order = 1-indexed)
DESCRIPTORS: dict[str, list[str]] = {
    # ── CiP 10 ──
    "CiP_10_KS01": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Establishes fetal wellbeing.",
        "Formulates a differential diagnosis.",
        "Demonstrates awareness of the risk factors for a morbidly adherent placenta.",
        "Understands the referral pathways when a morbidly adherent placenta is suspected.",
        "Discusses diagnosis with a person in a sensitive manner.",
        "Formulates an appropriate and individualised management plan, taking into account a patient's preferences and the urgency required.",
    ],
    "CiP_10_KS02": [
        "Appropriately assesses concerns about fetal movements.",
        "Demonstrates the skills to use ultrasound to locate the fetal heartbeat.",
        "Can use appropriate investigations to confirm the loss or death of a baby.",
        "Demonstrates the skills to use ultrasound to confirm the loss or death of a baby.",
        "Discusses a diagnosis with the pregnant person in a sensitive manner and recognises, in cases where a baby has died, the psychological impact on a person and their family.",
        "Is able to sensitively discuss management options where the death of a baby has occurred, including offering post mortem examination and taking informed consent.",
        "Can provide a supportive environment and signpost to relevant support services for an individual and her partner who have suffered the loss of a baby.",
    ],
    "CiP_10_KS03": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Establishes fetal wellbeing.",
        "Discusses findings with a pregnant person in a sensitive manner.",
        "Formulates an appropriate and individualised management plan, taking into account a patient's preferences and the urgency required.",
        "Aware of additional issues for babies at extremes of viability, including ethical concerns and additional therapies which may benefit them.",
        "Shows awareness of how to manage preterm labour when a cervical suture is present.",
        "Demonstrates the skills needed to remove a cervical suture.",
    ],
    "CiP_10_KS04": [
        "Demonstrates understanding of the physiology of labour.",
        "Is aware of situations where labour may be more complex, such as in a multiple pregnancy.",
        "Uses the person's history and clinical signs to anticipate possible problems.",
        "Can formulate safe management plans, taking into account a pregnant person's preferences.",
        "Can succinctly explain management plans to women and birthing partners.",
        "Discusses options for pain relief in labour.",
    ],
    "CiP_10_KS05": [
        "Can use intrapartum fetal surveillance strategies to help assess risk.",
        "Can recognise abnormal fetal heart rate patterns, perform and interpret related tests.",
        "Communicates concerns effectively and sensitively with colleagues, women and birthing partners.",
    ],
    "CiP_10_KS06": [
        "Can formulate safe management plans for induction and augmentation, taking into account a pregnant person's preferences.",
    ],
    "CiP_10_KS07": [
        "Can recognise when birth may need to be expedited.",
        "Communicates concerns and recommendations effectively and sensitively with colleagues, pregnant person and birthing partners.",
        "Formulates an appropriate and individualised management plan, taking into account a patient's preferences and the urgency required.",
        "Demonstrates the skills needed to facilitate a safe operative birth.",
        "Plans for birth with non-cephalic presentation, including breech.",
        "Plans for birth with variations in fetal position, including occipito posterior (OP).",
        "Demonstrates the skills needed to use ultrasound to confirm fetal presentation and lie.",
        "Demonstrates the skills to use ultrasound to confirm fetal position, including OP.",
    ],
    "CiP_10_KS08": [
        "Demonstrates the skills needed to manage problems in the immediate postpartum period, including physical and with mental health.",
        "Can demonstrate knowledge of what constitute signs of life.",
        "Demonstrates the skills needed to use ultrasound to assess the postpartum uterus.",
        "Demonstrates the skills needed to assess, classify and manage birth and pregnancy-related pelvic floor dysfunction and perineal trauma, including obstetric anal sphincter injury (OASI).",
        "Demonstrates the ability to debrief women and their families in the postnatal period.",
        "Discusses and prescribes appropriate pain relief.",
    ],
    "CiP_10_KS09": [
        "Demonstrates prompt assessment of an acutely deteriorating patient.",
        "Recognises and manages sepsis in pregnancy.",
        "Performs procedures that are necessary in an emergency situation.",
        "Escalates to senior colleagues and demonstrates the skills needed to collaborate with other specialities.",
    ],
    "CiP_10_KS10": [
        "Demonstrates leadership skills within the MDT, anticipating problems, prioritising and managing obstetric care.",
        "Recognises their own limitations and escalates care to senior colleagues and other specialities when appropriate.",
        "Makes sure a patient receives continuity of care, an effective handover and an appropriate discharge plan.",
        "Manages complex problems, including liaising with, and referring to, other specialties, where appropriate.",
        "Demonstrates the skills needed to sensitively explain unexpected events of labour and birth to someone and anticipates where a later debrief may be necessary.",
    ],
    # ── CiP 11 ──
    "CiP_11_KS01": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Formulates a differential diagnosis.",
        "Discusses diagnosis in a sensitive manner.",
        "Formulates an appropriate and individualised management plan, taking into account a patient's preferences and the urgency required.",
        "Recognises limitations and escalates care to senior colleagues and other specialities, when appropriate.",
        "Performs surgery, where appropriate.",
        "Ensures appropriate follow up.",
        "Demonstrates awareness of the quality of a patient's experience.",
    ],
    "CiP_11_KS02": [
        "Demonstrates the ability to counsel someone about cytology reports and Human papillomavirus (HPV) testing.",
        "Refers to colposcopy services, in accordance with national guidelines.",
    ],
    "CiP_11_KS03": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Discusses diagnosis and prognosis in a sensitive manner.",
        "Demonstrates knowledge of when to refer someone to a tertiary gynaecological oncology centre.",
        "Can counsel someone about surgical and non-surgical treatment options, taking into account their background health and preferences.",
        "Makes sure the patient has appropriate follow up, in line with national guidance.",
    ],
    "CiP_11_KS04": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Formulates a differential diagnosis.",
        "Discusses diagnosis with a patient in a sensitive manner.",
        "Can counsel someone about surgical and non-surgical treatment options, taking into account their background health and preferences.",
        "Makes sure a patient has an appropriate follow up.",
        "Demonstrates awareness of the quality of patient experience.",
    ],
    "CiP_11_KS05": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Recognises common vulval disorders.",
        "Formulates a differential diagnosis.",
        "Discusses diagnosis with a patient in a sensitive manner and recognises the psychological impact of vulval disease.",
        "Formulates an appropriate and individualised management plan, taking into account a patient's preferences and the urgency required.",
        "Recognises when to refer to allied specialities and the importance of the MDT.",
    ],
    "CiP_11_KS06": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Formulates an appropriate and individualised management plan, taking into account a patient's preferences, including complementary therapies and lifestyle changes.",
        "Appreciates the impact that the menopause may have on other aspects of wellbeing.",
    ],
    "CiP_11_KS07": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Is able to interpret results to plan effective care and counsel someone about their options, including where they can be referred and alternative ways to conceive.",
        "Understands the ethical issues surrounding IVF treatment.",
    ],
    "CiP_11_KS08": [
        "Takes a focused history, performs an appropriate examination and orders appropriate investigations.",
        "Offers advice to someone about contraceptive methods and understands factors which affect their choice of contraception, including comorbidities, patient preference, failure rates, etc.",
        "Demonstrates the ability to administer/fit different contraceptive methods.",
        "Demonstrates the ability to manage unplanned pregnancies, including medical and surgical abortion*",
        "Is aware of alternative sources of support and follow-up for patients, particularly in cases of unplanned pregnancy and termination of pregnancy.",
        "Offers sexual health screening advice and provides appropriate referral to genitourinary medicine (GUM) services to manage sexually transmitted infections.",
        "Identifies psychosexual problems, explores them and can refers someone to specialist services where available.",
        "Recognises the interactions between gynaecological problems and psychosexual problems.* Trainees who have personal beliefs that conflict with the provision of abortion, or for those undertaking training in a place where there are legal restrictions to provision of abortion, see Section 10 of the Definitive Document.",
    ],
    "CiP_11_KS09": [
        "Demonstrates the ability to assess a postoperative patient and makes sure they have adequate/optimum analgesia.",
        "Recognises non-gynaecological causes of pain.",
        "Demonstrates the ability to manage pain due to common gastrointestinal and urological conditions and to counsel a patient appropriately.",
        "Recognises when a patient with postoperative pain needs referring to other specialities.",
    ],
    # ── CiP 12 ──
    "CiP_12_KS01": [
        "Demonstrates the ability to provide preconceptual advice to women and sensitively discuss risks during pregnancy. Uses this to create tailored management plans, in conjunction with other specialties where appropriate.",
        "Identifies, assesses and manages pre-existing physical and mental health conditions in a pregnant or postnatal woman.",
        "Understands the impact of pregnancy on disease and of disease on pregnancy.",
        "Formulates appropriate and individualised management plans for pregnancy, birth and the postnatal period, in consultation with other specialities and obstetric anaesthesia.",
    ],
    "CiP_12_KS02": [
        "Prescribes safely and understands the challenge of safe prescribing in pregnancy, making changes to medications where necessary.",
        "Demonstrates the ability to recognise when conditions related, and unrelated, to pregnancy develop.",
        "Offers screening for, and treatment of, maternal infections that can affect fetal wellbeing and development.",
        "Demonstrates the ability to take a focused history and perform an appropriate physical examination of a pregnant person. Takes into account the physiological and anatomical changes of pregnancy.",
        "Identifies, assesses and manages both pregnancy-specific and non-specific conditions, and considers the impact on both maternal and fetal health.",
        "Demonstrates the ability to order and interpret appropriate investigations to monitor conditions during pregnancy.",
        "Formulates appropriate and tailored management plans for pregnancy and birth.",
        "Prepares and plans the different options for the birth of a baby in the breech presentation, including using External Cephalic Version (ECV). Doctors who wish to practice using ECV should have three summative competent OSATS.",
        "Prescribes medications and antimicrobials appropriately, in line with the latest evidence, and reviews and monitors therapeutic interventions.",
    ],
    "CiP_12_KS03": [
        "Demonstrates an ability to obtain a focused history, undertake an appropriate examination and order a clinically indicated investigation.",
        "Facilitates timely and appropriate investigation, management and referral to tertiary centres, if required.",
        "Demonstrates knowledge and an ability to work within local managed clinical networks.",
        "Demonstrates the ability to discuss concerns and clinical uncertainties with pregnant person in a sensitive manner.",
        "Formulates an appropriate and individualised management plans for pregnancy and birth.",
    ],
    "CiP_12_KS04": [
        "Demonstrates the ability to effectively and sensitively screen for mental health concerns arising in pregnant people.",
        "Demonstrates the ability to formulate the initial diagnosis and management of mental health conditions, with appropriate liaison and involvement of mental health services.",
        "Manages perinatal mental health emergencies in the antenatal and postnatal period effectively.",
        "Understands the impact that birth, birth trauma and adverse outcomes may have on someone's future mental health and is able to signpost women and their families to support services.",
    ],
    "CiP_12_KS05": [
        "Understands the significant impact that lifestyle factors may have on maternal and fetal health.",
        "Demonstrates the ability to take a focused history, perform an appropriate examination and to order clinically indicated investigations.",
        "Sensitively enquires about lifestyle factors to facilitate disclosure.",
        "Understands and demonstrates the ability to manage pregnancies where lifestyle factors cause complications.",
        "Formulates appropriate individualised management plans for pregnancy, birth and the postnatal period.",
        "Uses support services appropriately, according to local provision and taking into account the wishes of the pregnant person and the needs of the fetus/neonate.",
    ],
    "CiP_12_KS06": [
        "Identifies risk factors relating to previous pregnancy outcomes and advises women on the best current practice to mitigate risk.",
        "Can advise pregnant people on the potential impact of the mode of birth and intrapartum interventions on general and pelvic floor health.",
        "Effectively estimates risks to advise and inform decision making for pregnant person and their families.",
        "Formulates appropriate and individualised management plans for pregnancy and birth.",
        "Supports decision making for the pregnant person and their family when a fetal anomaly is identified.",
    ],
    "CiP_12_KS07": [
        "Manages a postnatal consultation.",
        "Demonstrates the ability to sensitively debrief women and their families after an unexpected birth experience or when a baby is admitted to the neonatal unit.",
        "Advises on the impact of events in this pregnancy on future health and pregnancies.",
        "Demonstrates the ability to take a focused history, undertake an appropriate physical examination for women who have sustained an OASI and either manage, or refer on to, specialist services, for further investigations, management and advice on future mode of birth.",
        "Demonstrates the ability to discuss and advise patients about postnatal contraception and administer/fit different contraceptive methods.",
        "Uses support services appropriately, according to local provision, taking into account the wishes of the woman and her family.",
        "Ensures effective handover and discharge to primary care.",
    ],
    # ── CiP 13 ──
    "CiP_13_KS01": [
        "Possesses knowledge of ethical and legal issues and an awareness of the situations where discrimination might occur.",
        "Respects different values of patients and colleagues.",
        "Recognises how health systems can discriminate against patients with protected characteristics and works to minimise this discrimination.",
        "Must not allow their personal beliefs to lead to discrimination.",
        "Adopts patient-centred assessments and interventions that are inclusive and respectful of diversity.",
        "Is able to perform consultations addressing the specific needs of a disabled person and being mindful that not all disabilities are visible.",
        "Understands the specific needs of transgender and nonbinary people and is able to perform consultations and refer appropriately to specialist services.",
    ],
    "CiP_13_KS02": [
        "Understands the impact of a patient's social, economic and environmental context on their health.",
        "Interacts with appropriate patient representatives and engages with colleagues from different professional and personal backgrounds when working in MDT teams to promote the health of patients and the public.",
        "Assesses the interaction between women's health and cultural beliefs and practices.",
        "Must be aware of and adhere to the legislation regarding certain cultural practices (e.g. Female Genital Mutilation (FGM), modern slavery) within the UK.",
    ],
    "CiP_13_KS03": [
        "Takes an appropriate social history to identify any pertinent social issues and can signpost patients to appropriate services.",
        "Considers the interaction between medical conditions, care and a woman's broader work and family life.",
        "Understands that people who care for dependents may face barriers in engaging with healthcare services or, as a result, have delayed engagement with healthcare providers which could impact on their health.",
        "Understands the principles of safeguarding and their responsibility in protecting people's health, wellbeing and human rights, and enabling them to live free from harm, abuse and neglect.",
        "Enquires about the safety of a woman and her children and is able to act if they have a history of domestic abuse.",
    ],
    "CiP_13_KS04": [
        "Understands how mental health issues can affect a woman's reproductive health.",
        "Knows how reproductive health issues can have a significant impact on the mental health of a woman and her partner.",
    ],
    # ── CiP 14 ──
    "CiP_14_KS01": [
        "Understands lifestyle factors which have an impact on someone's short- and long-term health.",
        "Provides appropriate lifestyle advice to women in a sensitive manner and facilitates access to useful support or services, e.g. smoking cessation, weight management, pelvic floor health and sexual health.",
        "Contributes to developments, or education in, health promotion.",
    ],
    "CiP_14_KS02": [
        "Understands the concept of screening.",
        "Has an awareness of, and promotes, the current national screening programmes in women's health.",
        "Knows about the current recommended vaccinations available to protect women and their unborn children.",
        "Is able to provide balanced advice regarding illness prevention strategies.",
        "Is able to inform a patient about the impact of pregnancy and childbirth on their general, sexual and pelvic health and advise on mitigating strategies.",
    ],
    "CiP_14_KS03": [
        "Is aware of the impact national policy has on local caregiving.",
        "Is able to challenge and advocate to make sure local health and social care service provision equates with national standards.",
        "Is aware of the interaction between the NHS and international healthcare bodies (e.g. the World Health Organization (WHO)).",
    ],
    "CiP_14_KS04": [
        "Understands how the increasing movement of people and health migration impacts health services.",
        "Is aware of the basic principles of global health.",
    ],
}


def legacy_to_ids(legacy_id: str) -> tuple[str, str, str]:
    """Return (key_skill_uuid, cip_part, ks_part) from legacy_id like CiP_10_KS05."""
    _prefix, cip_str, ks_token = legacy_id.split("_")
    cip = int(cip_str)
    ks = int(ks_token.replace("KS", ""))
    key_skill_id = f"00000000-0000-0000-0003-{cip:03d}{ks:03d}000000"
    return key_skill_id, f"{cip:03d}", f"{ks:03d}"


def sql_escape(text: str) -> str:
    return text.replace("'", "''")


def main() -> None:
    rows: list[str] = []
    total = 0
    for legacy_id in sorted(
        DESCRIPTORS.keys(),
        key=lambda x: (int(x.split("_")[1]), int(x.split("_")[2].replace("KS", ""))),
    ):
        texts = DESCRIPTORS[legacy_id]
        key_skill_id, cip_part, ks_part = legacy_to_ids(legacy_id)
        rows.append(f"  -- {legacy_id} ({len(texts)} descriptors)")
        for i, text in enumerate(texts, start=1):
            desc_id = f"00000000-0000-0000-0004-{cip_part}{ks_part}{i:03d}000"
            rows.append(
                f"  ('{desc_id}', '{key_skill_id}', '{sql_escape(text)}', {i}),"
            )
            total += 1

    # Remove trailing comma from last row
    rows[-1] = rows[-1].rstrip(",")

    sql = f"""-- Seed CiP 10-14 curriculum descriptors (Kaizen-confirmed, May 2026)
-- Adds {total} descriptors missing from 0002_seed_curriculum_data.sql

INSERT INTO descriptors (id, key_skill_id, text, sort_order) VALUES
{chr(10).join(rows)}
ON CONFLICT (id) DO NOTHING;
"""

    out = Path(__file__).resolve().parents[2] / "supabase/migrations/0028_seed_cip_10_14_descriptors.sql"
    out.write_text(sql, encoding="utf-8")
    print(f"Wrote {total} descriptors to {out}")


if __name__ == "__main__":
    main()
