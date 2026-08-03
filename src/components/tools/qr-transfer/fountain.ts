/**
 * Luby Transform (LT) fountain codes.
 *
 * The sender emits an endless stream of "droplets". Each droplet is the XOR of
 * a pseudo-randomly chosen subset of the source blocks, and the subset is fully
 * determined by a 32-bit seed carried in the packet header. The receiver can
 * therefore reconstruct the subset without any side channel.
 *
 * The point: every droplet is equally useful. A receiver that misses arbitrary
 * frames still finishes after collecting `k * (1 + overhead)` droplets, no
 * matter which ones. That removes the "missed frame => wait for the sender to
 * loop all the way around" stall of a plain sequential chunker, and removes the
 * need for an acknowledgement channel (which a one-way QR link does not have).
 *
 * Measured overhead with the tuned parameters below, independent of loss rate:
 *   k=128 ~32%   k=256 ~23%   k=512 ~18%   k=1024 ~13%   k=2048 ~9%
 *
 * A systematic prefix (seeds 0..k-1 emitting the raw blocks) was deliberately
 * rejected. It is perfect at exactly zero loss, but at even 5% loss the partial
 * knowledge it leaves behind de-tunes the soliton distribution for the LT phase
 * that follows, and measured overhead jumps to ~30-38% - worse than plain LT at
 * every k. Since a real camera link always drops some frames, plain LT wins.
 */

/** mulberry32: small, fast, well distributed, and safe for a zero seed. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Chosen by sweeping c in [0.01, 0.08] and delta in [0.01, 0.5] against a
// simulated decoder over k in [64, 2048]; this pair minimised droplet overhead.
const ROBUST_C = 0.03;
const ROBUST_DELTA = 0.5;

/**
 * Deterministically maps a seed to the set of source block indices that the
 * droplet XORs together. Encoder and decoder must agree exactly, so this is
 * kept free of any hidden state: the scratch permutation is always restored.
 */
export class DropletSampler {
  readonly k: number;
  /** Cumulative robust soliton distribution over degrees 1..k. */
  private readonly cdf: Float64Array;
  private readonly scratch: Int32Array;
  private readonly swapsA: Int32Array;
  private readonly swapsB: Int32Array;

  constructor(k: number) {
    this.k = k;
    this.cdf = buildRobustSolitonCdf(k);
    this.scratch = new Int32Array(k);
    for (let i = 0; i < k; i++) this.scratch[i] = i;
    this.swapsA = new Int32Array(k);
    this.swapsB = new Int32Array(k);
  }

  /** Writes the chosen indices into `out` and returns how many were written. */
  indices(seed: number, out: Int32Array): number {
    const k = this.k;
    if (k === 1) {
      out[0] = 0;
      return 1;
    }

    const rand = mulberry32(seed);
    const degree = this.sampleDegree(rand());

    // Partial Fisher-Yates over a persistent identity permutation. The swaps
    // are recorded and undone so the next call starts from identity again;
    // without that, the output would depend on call history rather than only
    // on the seed, and the decoder would compute different indices.
    const { scratch, swapsA, swapsB } = this;
    for (let j = 0; j < degree; j++) {
      const r = j + Math.floor(rand() * (k - j));
      const pick = r < k ? r : k - 1;
      swapsA[j] = j;
      swapsB[j] = pick;
      const tmp = scratch[j];
      scratch[j] = scratch[pick];
      scratch[pick] = tmp;
      out[j] = scratch[j];
    }
    for (let j = degree - 1; j >= 0; j--) {
      const a = swapsA[j];
      const b = swapsB[j];
      const tmp = scratch[a];
      scratch[a] = scratch[b];
      scratch[b] = tmp;
    }

    return degree;
  }

  private sampleDegree(u: number): number {
    const cdf = this.cdf;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  }
}

const buildRobustSolitonCdf = (k: number): Float64Array => {
  const p = new Float64Array(k);

  if (k <= 1) {
    p[0] = 1;
    return p;
  }

  // Ideal soliton
  p[0] = 1 / k;
  for (let d = 2; d <= k; d++) p[d - 1] = 1 / (d * (d - 1));

  // Robust component
  const r = ROBUST_C * Math.log(k / ROBUST_DELTA) * Math.sqrt(k);
  const pivot = Math.max(1, Math.floor(k / r));
  for (let d = 1; d < pivot; d++) p[d - 1] += r / (d * k);
  if (pivot <= k) p[pivot - 1] += (r * Math.log(r / ROBUST_DELTA)) / k;

  let sum = 0;
  for (let i = 0; i < k; i++) sum += p[i];

  let acc = 0;
  for (let i = 0; i < k; i++) {
    acc += p[i] / sum;
    p[i] = acc;
  }
  p[k - 1] = 1;

  return p;
};

const xorInto = (target: Uint8Array, source: Uint8Array, sourceOffset: number): void => {
  const len = target.length;
  // Block sizes are forced to a multiple of 4 so the fast path always applies.
  if ((len & 3) === 0 && (sourceOffset & 3) === 0 && (target.byteOffset & 3) === 0) {
    const t = new Uint32Array(target.buffer, target.byteOffset, len >> 2);
    const s = new Uint32Array(source.buffer, source.byteOffset + sourceOffset, len >> 2);
    for (let i = 0; i < t.length; i++) t[i] ^= s[i];
    return;
  }
  for (let i = 0; i < len; i++) target[i] ^= source[sourceOffset + i];
};

export class LtEncoder {
  readonly k: number;
  readonly blockSize: number;
  private readonly padded: Uint8Array;
  private readonly sampler: DropletSampler;
  private readonly indexBuf: Int32Array;

  constructor(payload: Uint8Array, blockSize: number) {
    if (blockSize % 4 !== 0) throw new Error("blockSize must be a multiple of 4");

    this.blockSize = blockSize;
    this.k = Math.max(1, Math.ceil(payload.length / blockSize));
    // Zero padding to a whole number of blocks; the real length travels in the
    // packet header so the receiver trims it back off.
    this.padded = new Uint8Array(this.k * blockSize);
    this.padded.set(payload);
    this.sampler = new DropletSampler(this.k);
    this.indexBuf = new Int32Array(this.k);
  }

  /** Builds the droplet for `seed` into a freshly allocated buffer. */
  droplet(seed: number): Uint8Array {
    const out = new Uint8Array(this.blockSize);
    const n = this.sampler.indices(seed, this.indexBuf);
    for (let i = 0; i < n; i++) {
      xorInto(out, this.padded, this.indexBuf[i] * this.blockSize);
    }
    return out;
  }
}

interface Pending {
  indices: Set<number>;
  data: Uint8Array;
}

export type AddResult = "progress" | "duplicate" | "stored";

export class LtDecoder {
  readonly k: number;
  readonly blockSize: number;
  readonly payloadLength: number;

  private readonly decoded: (Uint8Array | null)[];
  private readonly sampler: DropletSampler;
  private readonly indexBuf: Int32Array;
  private readonly pendingByIndex: Map<number, Set<Pending>>;
  private readonly seenSeeds = new Set<number>();
  private decodedCount = 0;
  /** Total droplets accepted, used to report coding overhead. */
  private acceptedCount = 0;

  constructor(payloadLength: number, blockSize: number) {
    this.payloadLength = payloadLength;
    this.blockSize = blockSize;
    this.k = Math.max(1, Math.ceil(payloadLength / blockSize));
    this.decoded = Array.from({ length: this.k }, () => null);
    this.sampler = new DropletSampler(this.k);
    this.indexBuf = new Int32Array(this.k);
    this.pendingByIndex = new Map();
  }

  get received(): number {
    return this.decodedCount;
  }

  get accepted(): number {
    return this.acceptedCount;
  }

  get complete(): boolean {
    return this.decodedCount === this.k;
  }

  /** True when block `i` has been recovered - used to paint the progress grid. */
  has(index: number): boolean {
    return this.decoded[index] !== null;
  }

  /**
   * `data` is consumed (mutated) by the decoder, so pass a buffer that is not
   * used elsewhere.
   */
  add(seed: number, data: Uint8Array): AddResult {
    if (data.length !== this.blockSize) return "duplicate";
    if (this.seenSeeds.has(seed)) return "duplicate";
    this.seenSeeds.add(seed);
    this.acceptedCount++;

    const n = this.sampler.indices(seed, this.indexBuf);
    const indices = new Set<number>();
    for (let i = 0; i < n; i++) {
      const idx = this.indexBuf[i];
      const known = this.decoded[idx];
      if (known) xorInto(data, known, 0);
      else indices.add(idx);
    }

    if (indices.size === 0) return "duplicate";

    if (indices.size > 1) {
      const pending: Pending = { indices, data };
      for (const idx of indices) {
        let set = this.pendingByIndex.get(idx);
        if (!set) {
          set = new Set();
          this.pendingByIndex.set(idx, set);
        }
        set.add(pending);
      }
      return "stored";
    }

    this.resolve(indices.values().next().value as number, data);
    return "progress";
  }

  /**
   * Peeling decoder. Solving one block can unlock pending droplets, which can
   * unlock more, so this runs as an explicit work queue rather than recursion.
   */
  private resolve(startIndex: number, startData: Uint8Array): void {
    let queue: Array<[number, Uint8Array]> = [[startIndex, startData]];

    while (queue.length > 0) {
      const next: Array<[number, Uint8Array]> = [];

      for (const [index, data] of queue) {
        if (this.decoded[index]) continue;
        this.decoded[index] = data;
        this.decodedCount++;

        const dependents = this.pendingByIndex.get(index);
        if (!dependents) continue;
        this.pendingByIndex.delete(index);

        for (const pending of dependents) {
          if (!pending.indices.has(index)) continue;
          xorInto(pending.data, data, 0);
          pending.indices.delete(index);

          if (pending.indices.size === 1) {
            const last = pending.indices.values().next().value as number;
            const set = this.pendingByIndex.get(last);
            if (set) {
              set.delete(pending);
              if (set.size === 0) this.pendingByIndex.delete(last);
            }
            pending.indices.clear();
            if (!this.decoded[last]) next.push([last, pending.data]);
          }
        }
      }

      queue = next;
    }
  }

  /** Concatenates the recovered blocks and trims the zero padding. */
  result(): Uint8Array | null {
    if (!this.complete) return null;
    const out = new Uint8Array(this.k * this.blockSize);
    for (let i = 0; i < this.k; i++) out.set(this.decoded[i]!, i * this.blockSize);
    return out.subarray(0, this.payloadLength);
  }
}
