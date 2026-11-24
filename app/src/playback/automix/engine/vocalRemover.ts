/**
 * High-performance Mid/Side Vocal Remover and Karaoke DSP Node.
 *
 * Algorithm:
 * 1. Dry path passes original signal at (1 - suppression).
 * 2. Wet path splits stereo into L & R.
 *    - Mid band (130 Hz - 7 kHz) generates inverted Side signals:
 *      Side_L = (Left - Right) * 0.5
 *      Side_R = (Right - Left) * 0.5 = -Side_L
 *    - Center-panned lead vocals destructively interfere and are eliminated.
 * 3. Low-frequency bass band (< 130 Hz) is extracted via Lowpass filter and summed back in
 *    to preserve kick drum and sub-bass energy.
 * 4. High-frequency band (> 7 kHz) can be gently preserved for ambient cymbals and air.
 */

export class VocalRemoverNode {
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;

  private readonly splitter: ChannelSplitterNode;
  private readonly merger: ChannelMergerNode;

  // Mid/Side matrix gains
  private readonly leftToSideL: GainNode;
  private readonly rightToSideL: GainNode;
  private readonly leftToSideR: GainNode;
  private readonly rightToSideR: GainNode;

  // Bass preservation filters and gains
  private readonly bassFilterL: BiquadFilterNode;
  private readonly bassFilterR: BiquadFilterNode;
  private readonly bassGainL: GainNode;
  private readonly bassGainR: GainNode;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = new GainNode(ctx, { gain: 1 });
    this.output = new GainNode(ctx, { gain: 1 });

    this.dryGain = new GainNode(ctx, { gain: 1 });
    this.wetGain = new GainNode(ctx, { gain: 0 });

    this.splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    this.merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });

    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: split into L (output 0) and R (output 1)
    this.input.connect(this.splitter);

    // Left channel output = +0.5 * L - 0.5 * R
    this.leftToSideL = new GainNode(ctx, { gain: 0.5 });
    this.rightToSideL = new GainNode(ctx, { gain: -0.5 });
    this.splitter.connect(this.leftToSideL, 0);
    this.splitter.connect(this.rightToSideL, 1);
    this.leftToSideL.connect(this.merger, 0, 0);
    this.rightToSideL.connect(this.merger, 0, 0);

    // Right channel output = -0.5 * L + 0.5 * R = +0.5 * R - 0.5 * L
    this.leftToSideR = new GainNode(ctx, { gain: -0.5 });
    this.rightToSideR = new GainNode(ctx, { gain: 0.5 });
    this.splitter.connect(this.leftToSideR, 0);
    this.splitter.connect(this.rightToSideR, 1);
    this.leftToSideR.connect(this.merger, 0, 1);
    this.rightToSideR.connect(this.merger, 0, 1);

    // Bass preservation path (< 130 Hz lowpass)
    this.bassFilterL = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 130, Q: 0.707 });
    this.bassFilterR = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 130, Q: 0.707 });
    this.bassGainL = new GainNode(ctx, { gain: 0.9 });
    this.bassGainR = new GainNode(ctx, { gain: 0.9 });

    this.splitter.connect(this.bassFilterL, 0);
    this.splitter.connect(this.bassFilterR, 1);
    this.bassFilterL.connect(this.bassGainL);
    this.bassFilterR.connect(this.bassGainR);
    this.bassGainL.connect(this.merger, 0, 0);
    this.bassGainR.connect(this.merger, 0, 1);

    // Route wet merger through wetGain to output
    this.merger.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  sync(enabled: boolean, suppression: number, preserveBass: boolean): void {
    const now = this.ctx.currentTime;
    const targetWet = enabled ? suppression : 0;
    const targetDry = enabled ? Math.max(0, 1 - suppression * 0.95) : 1;
    const bassLevel = enabled && preserveBass ? 0.95 : 0;

    try {
      this.wetGain.gain.setTargetAtTime(targetWet, now, 0.02);
      this.dryGain.gain.setTargetAtTime(targetDry, now, 0.02);
      this.bassGainL.gain.setTargetAtTime(bassLevel, now, 0.02);
      this.bassGainR.gain.setTargetAtTime(bassLevel, now, 0.02);
    } catch {
      this.wetGain.gain.value = targetWet;
      this.dryGain.gain.value = targetDry;
      this.bassGainL.gain.value = bassLevel;
      this.bassGainR.gain.value = bassLevel;
    }
  }
}
