/** Separate acknowledgement from the actual dangerous plant mutation. */
export function canConfirmPlantTransition(
  plant: { code: string; is_active: boolean } | null,
  enteredCode: string,
  acknowledged: boolean,
): boolean {
  return plant !== null &&
    acknowledged &&
    plant.code.length > 0 &&
    enteredCode.trim() === plant.code;
}
