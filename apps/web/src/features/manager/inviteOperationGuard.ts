/** Single and CSV invitation creation share the same mutation admission rule.
 * A possibly committed request in either mode blocks both modes until the
 * operator has fetched the server roster and acknowledged its contents.
 */
export interface InviteOperationState {
  singlePending: boolean;
  bulkPending: boolean;
  rosterPending: boolean;
  csvPending: boolean;
  singleOutcomeUnknown: boolean;
  bulkOutcomeUnknown: boolean;
}
export function canStartInviteOperation(s: InviteOperationState): boolean {
  return !(s.singlePending || s.bulkPending || s.rosterPending || s.csvPending ||
    s.singleOutcomeUnknown || s.bulkOutcomeUnknown);
}
