/**
 * Discards out-of-order RPC list responses. A superseded read is not
 * evidence that any unknown invitation/player mutation was reconciled.
 */
export class ReadRequestGate {
  private revision = 0;

  begin(): number {
    this.revision += 1;
    return this.revision;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }

  invalidate(): void {
    this.revision += 1;
  }
}
