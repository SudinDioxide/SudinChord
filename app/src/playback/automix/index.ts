import { AutoDJ, type AutomixHost, type AutoDJSnapshot } from './engine/autodj';
import { Deck } from './engine/deck';
import { LoopDeck } from './engine/loopDeck';
import type { TransitionPlan } from './engine/transition-scheduler';
import { registerGraphForFx, EQ_FREQUENCIES, EQ_Q_VALUES, type SpatialProcessorHandle } from '@/state/audioFx';

export type { AutomixHost, AutoDJSnapshot, TransitionPlan };
export type { MixWindow } from './engine/autodj';
export type { LoopMixPlan, SungSpans } from './engine/loopMix';
export { sungSpansFromLines } from './engine/loopMix';
export { analyzer } from './analysis/analyzer';

export { AUTOMIX_BARS } from './choices';

export interface SpatialProcessor extends SpatialProcessorHandle {
  input: GainNode;
  output: GainNode;
}

export interface AutomixGraph {
  ctx: AudioContext;
  /** The user's volume and mute. */
  master: GainNode;
  preamp: GainNode;
  decks: Deck[];
  dj: AutoDJ;
  analyser: AnalyserNode;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  spatialProcessor: SpatialProcessor;
  limiter: DynamicsCompressorNode;
}

/**
 * Spatial Audio Processor Architecture:
 * 
 * 1. Native Web Audio HRTF 3D Binaural Spatializer (inspired by twoz/binaural-vst & CIPIC HRTF)
 *    - Positions virtual acoustic studio monitors around the head in 3D Cartesian/Spherical coordinates.
 *    - Convolves through browser's native C++ HRTF engine with interaural time and level differences (ITD/ILD).
 *    - Provides natural out-of-head listening on headphones and supports 360° rotational orbit panner.
 * 2. Mid/Side (M/S) Matrix Stereo Widener & Center Fold-Down
 * 3. Bit-perfect straight-wire dry bypass path
 */
function createSpatialProcessor(ctx: AudioContext): SpatialProcessor {
  const input = new GainNode(ctx, { gain: 1 });
  const output = new GainNode(ctx, { gain: 1 });

  const dryGain = new GainNode(ctx, { gain: 1 });
  const msGain = new GainNode(ctx, { gain: 0 });
  const binauralGain = new GainNode(ctx, { gain: 0 });

  // Dry bypass route
  input.connect(dryGain);
  dryGain.connect(output);

  // Splitter for M/S and Binaural branches
  const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
  input.connect(splitter);

  // --- Mid/Side Matrix Branch ---
  const midSum = new GainNode(ctx, { gain: 1 });
  const midL = new GainNode(ctx, { gain: 0.5 });
  const midR = new GainNode(ctx, { gain: 0.5 });

  const sideSum = new GainNode(ctx, { gain: 1 });
  const sideL = new GainNode(ctx, { gain: 0.5 });
  const sideR = new GainNode(ctx, { gain: -0.5 });

  const sideGain = new GainNode(ctx, { gain: 1.0 });
  const sideInvert = new GainNode(ctx, { gain: -1.0 });

  const msMerger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });

  splitter.connect(midL, 0);
  splitter.connect(midR, 1);
  midL.connect(midSum);
  midR.connect(midSum);

  splitter.connect(sideL, 0);
  splitter.connect(sideR, 1);
  sideL.connect(sideSum);
  sideR.connect(sideSum);

  sideSum.connect(sideGain);

  midSum.connect(msMerger, 0, 0);
  sideGain.connect(msMerger, 0, 0);

  midSum.connect(msMerger, 0, 1);
  sideGain.connect(sideInvert);
  sideInvert.connect(msMerger, 0, 1);

  msMerger.connect(msGain);
  msGain.connect(output);

  // --- Binaural HRTF Branch (twoz/binaural-vst inspired) ---
  const listener = ctx.listener;
  try {
    if (listener.forwardX) {
      listener.positionX.setValueAtTime(0, ctx.currentTime);
      listener.positionY.setValueAtTime(0, ctx.currentTime);
      listener.positionZ.setValueAtTime(0, ctx.currentTime);
      listener.forwardX.setValueAtTime(0, ctx.currentTime);
      listener.forwardY.setValueAtTime(0, ctx.currentTime);
      listener.forwardZ.setValueAtTime(-1, ctx.currentTime);
      listener.upX.setValueAtTime(0, ctx.currentTime);
      listener.upY.setValueAtTime(1, ctx.currentTime);
      listener.upZ.setValueAtTime(0, ctx.currentTime);
    } else {
      listener.setPosition?.(0, 0, 0);
      listener.setOrientation?.(0, 0, -1, 0, 1, 0);
    }
  } catch {}

  const pannerL = new PannerNode(ctx, {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    rolloffFactor: 0,
  });
  const pannerR = new PannerNode(ctx, {
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    rolloffFactor: 0,
  });

  // Initial virtual monitor position: ±35 degrees azimuth, 1.8m distance
  const initAz = (35 * Math.PI) / 180;
  const initDist = 1.8;
  const initX = initDist * Math.sin(initAz);
  const initZ = -initDist * Math.cos(initAz);

  try {
    pannerL.positionX.setValueAtTime(-initX, ctx.currentTime);
    pannerL.positionY.setValueAtTime(0, ctx.currentTime);
    pannerL.positionZ.setValueAtTime(initZ, ctx.currentTime);

    pannerR.positionX.setValueAtTime(initX, ctx.currentTime);
    pannerR.positionY.setValueAtTime(0, ctx.currentTime);
    pannerR.positionZ.setValueAtTime(initZ, ctx.currentTime);
  } catch {
    pannerL.setPosition?.(-initX, 0, initZ);
    pannerR.setPosition?.(initX, 0, initZ);
  }

  splitter.connect(pannerL, 0);
  splitter.connect(pannerR, 1);

  pannerL.connect(binauralGain);
  pannerR.connect(binauralGain);
  binauralGain.connect(output);

  return {
    input,
    output,
    sideGain,
    pannerL,
    pannerR,
    msGain,
    binauralGain,
    dryGain,
  };
}

/**
 * Routes the player's two <audio> elements through Web Audio, one AutoMix
 * deck each, and builds the mix loop over them. A media element can be
 * routed only once, so this is for the life of the page; from then on the
 * elements stay at volume 1 and the graph carries volume, EQ, and normalization.
 */
export function createAutomixGraph(
  audios: HTMLAudioElement[],
  host: (decks: Deck[]) => Omit<AutomixHost, 'ctx' | 'loopDecks'>,
  onUpdate?: (snap: AutoDJSnapshot) => void,
): AutomixGraph {
  const ctx = new AudioContext({ latencyHint: 'playback' });
  void ctx.resume();
  const master = new GainNode(ctx, { gain: 1 });
  const preamp = new GainNode(ctx, { gain: 1 });

  // 10-Band Graphic Equalizer Filter Chain with tuned musical Q factors
  const eqFilters = EQ_FREQUENCIES.map((freq, i) => {
    const filter = new BiquadFilterNode(ctx);
    filter.frequency.value = freq;
    filter.gain.value = 0;
    if (i === 0) {
      filter.type = 'lowshelf';
    } else if (i === EQ_FREQUENCIES.length - 1) {
      filter.type = 'highshelf';
    } else {
      filter.type = 'peaking';
      filter.Q.value = EQ_Q_VALUES[i] ?? 1.4;
    }
    return filter;
  });

  // Loudness Normalization Dynamics Compressor (smooth broadcast leveling)
  const compressor = new DynamicsCompressorNode(ctx, {
    threshold: -24,
    knee: 36,
    ratio: 4,
    attack: 0.02,
    release: 0.35,
  });

  // Studio 3D Spatial Audio Processor (HRTF Binaural & Mid/Side)
  const spatialProcessor = createSpatialProcessor(ctx);

  // Transparent Studio Output Brickwall Peak Limiter (anti-saturation & zero clipping guard)
  const limiter = new DynamicsCompressorNode(ctx, {
    threshold: -0.8,
    knee: 8,
    ratio: 16,
    attack: 0.005,
    release: 0.1,
  });

  const analyser = new AnalyserNode(ctx, {
    fftSize: 256,
    smoothingTimeConstant: 0.82,
  });

  // Connect Audio Chain: master -> preamp -> EQ[0..9] -> compressor -> spatialProcessor -> limiter -> analyser -> destination
  let lastNode: AudioNode = master;
  lastNode.connect(preamp);
  lastNode = preamp;
  for (const filter of eqFilters) {
    lastNode.connect(filter);
    lastNode = filter;
  }
  lastNode.connect(compressor);
  compressor.connect(spatialProcessor.input);
  spatialProcessor.output.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  // Sync with user's saved audio FX settings
  registerGraphForFx({
    ctx,
    preamp,
    eqFilters,
    compressor,
    spatialProcessor,
  });

  const decks = audios.map((audio, n) => new Deck(n === 0 ? 'A' : 'B', ctx, audio, master));
  // the loop mix's stretch decks (AutoMix's own), built the first time a loop mix is prepared
  let loops: Promise<[LoopDeck, LoopDeck]> | null = null;
  const loopDecks = () => (loops ??= Promise.all([LoopDeck.create(ctx, master), LoopDeck.create(ctx, master)]));
  const dj = new AutoDJ({ ctx, loopDecks, ...host(decks) }, onUpdate);
  return {
    ctx,
    master,
    preamp,
    decks,
    dj,
    analyser,
    eqFilters,
    compressor,
    spatialProcessor,
    limiter,
  };
}
