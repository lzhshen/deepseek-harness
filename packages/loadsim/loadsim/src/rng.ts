/**
 * Seeded pseudo-random number generator for deterministic simulations. Tests
 * and the load report replay the exact same scenario from one seed.
 * @module @deepseek-ai/dsh-loadsim/rng
 */

/** mulberry32: a tiny, fast, seeded PRNG returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded PRNG source with a couple of convenience samplers. */
export class Rng {
  private readonly nextValue: () => number

  /** @param seed - the replayable seed. */
  constructor(seed: number) {
    this.nextValue = mulberry32(seed)
  }

  /** Uniform value in [0, 1). */
  next(): number {
    return this.nextValue()
  }

  /** Uniform value in `[min, max]` (integer range). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Uniform jitter in `[-spread, spread]`. */
  jitter(spread: number): number {
    return (this.next() * 2 - 1) * spread
  }
}
