export class FpsMeter {
  private sampleStart: number | null = null;
  private frames = 0;

  addFrame(timestamp: number): number | null {
    if (this.sampleStart === null) this.sampleStart = timestamp;
    this.frames += 1;
    const elapsed = timestamp - this.sampleStart;
    if (elapsed < 1000) return null;
    const fps = Math.round(Math.max(0, this.frames - 1) * 1000 / elapsed);
    this.sampleStart = timestamp;
    this.frames = 0;
    return fps;
  }
}
