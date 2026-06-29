export type OneTapBranchAnswer =
  | "interested"
  | "price_concern"
  | "bad_timing"
  | "still_comparing"
  | "spouse_approval"
  | "need_to_talk"
  | "went_another_way";

export const STILL_COMPARING_MARKER = "[One-tap] Still comparing";
export const SPOUSE_APPROVAL_MARKER = "[One-tap] Need spouse or partner approval";

export const ONE_TAP_CHOICES: ReadonlyArray<{
  id: OneTapBranchAnswer;
  answerType:
    | "interested"
    | "price_concern"
    | "bad_timing"
    | "question"
    | "need_to_talk"
    | "went_another_way";
  questionText?: string;
  label: string;
  playbookBranch:
    | "still_interested"
    | "price_concern"
    | "bad_timing"
    | "still_comparing"
    | "spouse_approval"
    | "need_to_talk"
    | "went_another_way";
}> = [
  {
    id: "interested",
    answerType: "interested",
    label: "Let's do it — what's next?",
    playbookBranch: "still_interested",
  },
  {
    id: "price_concern",
    answerType: "price_concern",
    label: "Price is the hold-up",
    playbookBranch: "price_concern",
  },
  {
    id: "bad_timing",
    answerType: "bad_timing",
    label: "Timing's off",
    playbookBranch: "bad_timing",
  },
  {
    id: "still_comparing",
    answerType: "question",
    questionText: STILL_COMPARING_MARKER,
    label: "Still comparing",
    playbookBranch: "still_comparing",
  },
  {
    id: "spouse_approval",
    answerType: "question",
    questionText: SPOUSE_APPROVAL_MARKER,
    label: "Need to talk it over",
    playbookBranch: "spouse_approval",
  },
  {
    id: "need_to_talk",
    answerType: "need_to_talk",
    label: "Can we talk?",
    playbookBranch: "need_to_talk",
  },
  {
    id: "went_another_way",
    answerType: "went_another_way",
    label: "Went another way",
    playbookBranch: "went_another_way",
  },
] as const;
