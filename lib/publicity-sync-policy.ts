export type PlaybillPublicityWriteState = {
  show_id?: string | null;
  status?: string | null;
  is_published?: boolean | null;
};

export function publicityWritesDisabledReason(enabled: boolean) {
  return enabled ? null : "Playbill writes are disabled. The approved production copy was preserved and was not sent.";
}

export function publicitySyncBlockReason(state: PlaybillPublicityWriteState | null) {
  if (!state?.show_id) return "This project is not linked to a Playbill show.";
  if (state.is_published) return "The linked Playbill show is published and read-only.";
  if (state.status !== "draft") return "The linked Playbill show is not a draft and cannot be changed.";
  return null;
}
