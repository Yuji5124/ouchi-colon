/** Prevents duplicate callbacks and stale generations from finishing a newer reply. */
export class TurnCompletionGate {
  private completedTurn = -1;

  complete(turn: number, currentTurn: number, finish: () => void): boolean {
    if (turn !== currentTurn || turn === this.completedTurn) return false;
    this.completedTurn = turn;
    finish();
    return true;
  }
}
