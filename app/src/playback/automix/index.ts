import { AutoDJ, type AutomixHost, type AutoDJSnapshot } from './engine/autodj';
import { Deck } from './engine/deck';
import { LoopDeck } from './engine/loopDeck';
import { VocalRemoverNode } from './engine/vocalRemover';
import type { TransitionPlan } from './engine/transition-scheduler';
import { registerGraphForFx, EQ_FREQUENCIES, EQ_Q_VALUES } from '@/state/audioFx';
import { registerVocalRemover } from '@/state/karaoke';

export type { AutomixHost, AutoDJSnapshot, TransitionPlan };
export type { MixWindow } from './engine/autodj';
export type { LoopMixPlan, SungSpans } from './engine/loopMix';
export { sungSpansFromLines } from './engine/loopMix';
export { analyzer } from './analysis/analyzer';

export { AUTOMIX_BARS } from './choices';

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
  const vocalRemover = new VocalRemoverNode(ctx);
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

  // Loudness Normalization Dynamics Compressor
  const compressor = new DynamicsCompressorNode(ctx, {
    threshold: -24,
    knee: 30,
    ratio: 8,
    attack: 0.003,
    release: 0.25,
  });

  const analyser = new AnalyserNode(ctx, {
    fftSize: 256,
    smoothingTimeConstant: 0.82,
  });

  // Connect Audio Chain: master -> vocalRemover -> preamp -> EQ[0..9] -> compressor -> analyser -> destination
  let lastNode: AudioNode = master;
  lastNode.connect(vocalRemover.input);
  lastNode = vocalRemover.output;
  lastNode.connect(preamp);
  lastNode = preamp;
  for (const filter of eqFilters) {
    lastNode.connect(filter);
    lastNode = filter;
  }
  lastNode.connect(compressor);
  compressor.connect(analyser);
  analyser.connect(ctx.destination);

  // Sync with user's saved audio FX & karaoke settings
  registerGraphForFx({ ctx, preamp, eqFilters, compressor });
  registerVocalRemover(vocalRemover);

  const decks = audios.map((audio, n) => new Deck(n === 0 ? 'A' : 'B', ctx, audio, master));
  // the loop mix's stretch decks (AutoMix's own), built the first time a loop mix is prepared
  let loops: Promise<[LoopDeck, LoopDeck]> | null = null;
  const loopDecks = () => (loops ??= Promise.all([LoopDeck.create(ctx, master), LoopDeck.create(ctx, master)]));
  const dj = new AutoDJ({ ctx, loopDecks, ...host(decks) }, onUpdate);
  return { ctx, master, preamp, decks, dj, analyser, eqFilters, compressor };
}
