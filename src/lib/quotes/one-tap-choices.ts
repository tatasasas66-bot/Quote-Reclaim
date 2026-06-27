export type OneTapBranchAnswer =
  | "interested"
  | "price_concern"
  | "bad_timing"
  | "need_to_talk"
  | "went_another_way";

export const ONE_TAP_CHOICES: ReadonlyArray<{
  id: OneTapBranchAnswer;
  label: string;
  playbookBranch:
    | "still_interested"
    | "price_concern"
    | "bad_timing"
    | "need_to_talk"
    | "went_another_way";
}> = [
  {
    id: "interested",
    label: "Let's do it — what's next?",
    playbookBranch: "still_interested",
  },
  {
    id: "price_concern",
    label: "Price is the hold-up",
    playbookBranch: "price_concern",
  },
  {
    id: "bad_timing",
    label: "Timing's off",
    playbookBranch: "bad_timing",
  },
  {
    id: "need_to_talk",
    label: "Can we talk?",
    playbookBranch: "need_to_talk",
  },
  {
    id: "went_another_way",
    label: "Went another way",
    playbookBranch: "went_another_way",
  },
] as const;
