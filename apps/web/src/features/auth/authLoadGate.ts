/** Discards async auth reads started under an older session/revision. */
export class AuthLoadGate {
  private revision = 0;
  private userId: string | null = null;

  begin(userId: string | null): number {
    this.userId = userId;
    this.revision += 1;
    return this.revision;
  }

  isCurrent(revision: number, userId: string | null): boolean {
    return this.revision === revision && this.userId === userId;
  }

  invalidate(): void {
    this.begin(null);
  }
}
