-- Align One-Tap Reply with the contractor-facing Reply Playbook while keeping
-- legacy answer types valid for existing links and stored replies.

alter table public.one_tap_replies
  drop constraint if exists one_tap_replies_answer_type_check;

alter table public.one_tap_replies
  add constraint one_tap_replies_answer_type_check
  check (answer_type in (
    'interested',
    'price_concern',
    'bad_timing',
    'need_to_talk',
    'went_another_way',
    'question',
    'not_now',
    'option_selected'
  ));
