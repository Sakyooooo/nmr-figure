/**
 * Delta で処理していない生データ (FID) を、このアプリでスペクトルにする。
 * 手順: DC 補正 → 指数関数の窓 (LB) → ゼロ詰め → FFT → 装置の遅れ (デジタルフィルター・受信の遅れ) の補正
 *       → 位相補正 (0次・1次) → ベースライン補正
 */

export interface FidData {
  re: Float32Array;
  im: Float32Array;
  /** スペクトル幅 (Hz) */
  sw: number;
  /** 0 ppm の周波数 (MHz) */
  refMHz: number;
  /** 中心の ppm */
  offsetPpm: number;
  /** デジタルフィルターの遅れ (点) */
  groupDelay: number;
  /** パルスから受信を始めるまでの遅れ (点。Delta の acq_delay × スペクトル幅)。これがないと 1次位相が大きくずれる */
  acqDelay: number;
  /** 残す割合 (Delta の x_sweep_clipped / x_sweep)。端はフィルターで減衰している */
  clip: number;
}

export interface Processing {
  /** 指数関数の窓の線幅 (Hz) */
  lb: number;
  /** 0次位相 (度) */
  ph0: number;
  /** 1次位相 (度)。装置の遅れを補正した残り。表示範囲の全幅で ph1 だけ回る */
  ph1: number;
  /** 1次位相の中心 (ppm)。ここでは 1次位相が効かない */
  pivot: number;
  baseline: boolean;
}

export interface Spectrum {
  /** 表示の向き (高 ppm → 低 ppm) の複素スペクトル */
  re: Float64Array;
  im: Float64Array;
  first: number;
  last: number;
  /** FID を1点ずらすのと同じになる 1次位相 (度)。1次位相はほぼこの周期で同じ見た目になる */
  period: number;
}

export function defaultLb(nucleus: string) {
  return nucleus === '1H' ? 0.2 : nucleus === '31P' ? 2 : 1;
}

/**
 * JEOL のデジタルフィルターの遅れ (点)。パラメーター orders / factors から求める
 * (jeolconverter と同じ式。1文字目が段数、残りが各段の次数)。
 */
export function jeolGroupDelay(orders: string, factors: string): number {
  const stages = Number.parseInt(orders.slice(0, 1), 10);
  if (!stages || factors.length < stages) return 0;
  const width = (orders.length - 1) / stages;
  const f = [...factors.slice(0, stages)].map(Number);
  let delay = 0;
  for (let l = 0; l < stages; l++) {
    const order = Number.parseInt(orders.slice(1 + l * width, 1 + (l + 1) * width), 10);
    let product = 1;
    for (let p = l; p < stages; p++) product *= f[p];
    delay += (order - 1) / product;
  }
  return delay / 2;
}

/** FFT までと、フィルターの遅れの補正 (位相補正の前) */
export function transform(fid: FidData, lb: number): Spectrum {
  const n = fid.re.length;
  let size = 1;
  while (size < n) size *= 2;
  size = Math.min(size * 2, 1 << 18);
  const re = new Float64Array(size);
  const im = new Float64Array(size);

  // DC 補正: 後ろ 10% の平均を引く
  const tail = Math.max(1, Math.floor(n / 10));
  let dcRe = 0;
  let dcIm = 0;
  for (let k = n - tail; k < n; k++) {
    dcRe += fid.re[k];
    dcIm += fid.im[k];
  }
  dcRe /= tail;
  dcIm /= tail;

  const gd = fid.groupDelay;
  const dt = 1 / fid.sw;
  for (let k = 0; k < Math.min(n, size); k++) {
    const w = k > gd ? Math.exp(-Math.PI * lb * (k - gd) * dt) : 1;
    re[k] = (fid.re[k] - dcRe) * w;
    im[k] = (fid.im[k] - dcIm) * w;
  }
  // 最初の点は台形則で半分にする (ベースラインのずれを防ぐ)。遅れのある JEOL ではほぼ 0
  re[0] *= 0.5;
  im[0] *= 0.5;

  fft(re, im);

  // 並べ替え: 低周波数 → 高周波数 (fftshift) にしてから、表示の向き (高 → 低) に反転する。
  // 同時に、時間の原点のずれ (フィルターの遅れ gd 点から、受信の遅れを引いたもの) ぶんの 1次位相を戻す
  const shift = gd - (fid.acqDelay || 0);
  const keep = Math.round(size * Math.min(1, Math.max(0.05, fid.clip)));
  const start = Math.floor((size - keep) / 2);
  const outRe = new Float64Array(keep);
  const outIm = new Float64Array(keep);
  for (let r = 0; r < keep; r++) {
    const j = size - 1 - (start + r); // fftshift 後の位置
    const bin = j - size / 2; // 符号付きの周波数の番号
    const src = (bin + size) % size; // fftshift 前の位置
    const phi = (2 * Math.PI * shift * bin) / size;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    outRe[r] = re[src] * c - im[src] * s;
    outIm[r] = re[src] * s + im[src] * c;
  }
  const hz = (r: number) => (size - 1 - (start + r) - size / 2) * (fid.sw / size);
  return {
    re: outRe,
    im: outIm,
    first: fid.offsetPpm + hz(0) / fid.refMHz,
    last: fid.offsetPpm + hz(keep - 1) / fid.refMHz,
    period: (360 * keep) / size,
  };
}

/** 位相補正した実部 */
export function phaseReal(spec: Spectrum, ph0: number, ph1: number, pivot: number): Float64Array {
  const n = spec.re.length;
  const out = new Float64Array(n);
  const pivotIndex = ((spec.first - pivot) / (spec.first - spec.last)) * (n - 1);
  const a0 = (ph0 * Math.PI) / 180;
  const a1 = (ph1 * Math.PI) / 180 / n;
  for (let r = 0; r < n; r++) {
    const phi = a0 + a1 * (r - pivotIndex);
    out[r] = spec.re[r] * Math.cos(phi) - spec.im[r] * Math.sin(phi);
  }
  return out;
}

/** 一番大きいピークの ppm (1次位相の中心に使う) */
export function tallestPpm(spec: Spectrum): number {
  let best = 0;
  let bestV = -1;
  for (let r = 0; r < spec.re.length; r++) {
    const v = spec.re[r] * spec.re[r] + spec.im[r] * spec.im[r];
    if (v > bestV) {
      bestV = v;
      best = r;
    }
  }
  return spec.first + ((spec.last - spec.first) * best) / (spec.re.length - 1);
}

interface PeakPhase {
  /** そのピークの位相のずれ (ラジアン) */
  phase: number;
  weight: number;
  /** 1次位相の中心からの位置 (全幅を 1 とする) */
  x: number;
}

/**
 * 自動の位相補正。どちらも装置の遅れを補正したあとの、残りの小さな位相を求める。
 * - 1H: スペクトル全体の形 (ACME) で 0次・1次を探す。多重線が混み合っていて、ピークごとの位相は当てにならない
 * - 13C・31P など: ピークがまばらで溶媒が飛び抜けて大きく、ACME では 1次位相を大きく外す。
 *   孤立したピークの頂点の位相から 1次位相を求め (決まらなければ 0)、0次位相を ACME で合わせる
 */
export function autoPhase(spec: Spectrum, pivot: number, nucleus: string): { ph0: number; ph1: number } {
  if (nucleus === '1H') return acmePhase(spec, pivot);
  const peaks = peakPhases(spec, pivot);
  const ph1 = peaks.length ? deg(fitPeaks(peaks, rad(spec.period / 2)).s) : 0;
  return { ph0: acmePh0(spec, pivot, ph1), ph1 };
}

/**
 * 孤立したピークの頂点での位相のずれ。
 * 近くのピークの裾が重なると頂点の位相がずれるので、両側がベースライン近くまで下がっているピークだけを使う。
 */
function peakPhases(spec: Spectrum, pivot: number): PeakPhase[] {
  const { re, im } = spec;
  const n = re.length;
  const mag = new Float64Array(n);
  for (let r = 0; r < n; r++) mag[r] = Math.hypot(re[r], im[r]);
  const sigma = noiseLevel(re);
  const pivotIndex = ((spec.first - pivot) / (spec.first - spec.last)) * (n - 1);

  const peaks: (PeakPhase & { snr: number })[] = [];
  const maxHalf = 64;
  for (let r = 2; r < n - 2; r++) {
    const m = mag[r];
    if (m < sigma * 20 || !(m > mag[r - 1] && m >= mag[r + 1] && m > mag[r - 2] && m >= mag[r + 2])) continue;
    let a = r;
    let b = r;
    while (a > 0 && r - a <= maxHalf && mag[a] > m / 2) a--;
    while (b < n - 1 && b - r <= maxHalf && mag[b] > m / 2) b++;
    if (r - a > maxHalf || b - r > maxHalf) continue;
    // 半値幅の 20 倍の範囲で、両側ともピークの 5% まで下がっていること (雑音の分は差し引く)
    const reach = Math.round(Math.max(1, (b - a) / 2) * 20);
    if (r - reach < 0 || r + reach >= n) continue;
    let left = m;
    let right = m;
    for (let k = 1; k <= reach; k++) {
      left = Math.min(left, mag[r - k]);
      right = Math.min(right, mag[r + k]);
    }
    if (Math.max(left, right) - sigma * 2 > m * 0.05) continue;
    const zr = re[r - 1] + re[r] + re[r + 1];
    const zi = im[r - 1] + im[r] + im[r + 1];
    const snr = m / sigma;
    // 大きなピークが独り占めしないよう、重みは頭打ちにする
    peaks.push({ phase: -Math.atan2(zi, zr), weight: Math.min(snr, 50), x: (r - pivotIndex) / n, snr });
  }
  // 一番大きいピークを基準に、ほかのピークの位相を ±180° の中に揃える (装置の遅れは補正済みなので回り込まない)
  if (peaks.length) {
    const ref = peaks.reduce((p, q) => (q.snr > p.snr ? q : p));
    for (const g of peaks) g.phase = ref.phase + wrapRad(g.phase - ref.phase);
  }
  return peaks;
}

/**
 * ピークの位相に直線を当てる。ピークと間違えた裾や雑音は位相がばらばらなので、
 * 多くのピークが 12° 以内に乗る直線を2点から探し (RANSAC)、乗ったピークだけで当て直す。
 */
function fitPeaks(peaks: PeakPhase[], limit: number) {
  const tol = rad(12);
  const score = (c: number, s: number) => {
    let t = 0;
    for (const g of peaks) if (Math.abs(wrapRad(g.phase - (c + s * g.x))) < tol) t += g.weight;
    return t;
  };
  let best = { c: peaks[0].phase, s: 0, v: -1 };
  const consider = (c: number, s: number) => {
    if (Math.abs(s) > limit) return;
    const v = score(c, s);
    // 同じくらいなら傾きの小さいほう
    if (v > best.v + 1e-9 || (Math.abs(v - best.v) <= 1e-9 && Math.abs(s) < Math.abs(best.s))) best = { c, s, v };
  };
  for (const g of peaks) consider(g.phase, 0);
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      const dx = peaks[j].x - peaks[i].x;
      if (Math.abs(dx) < 0.02) continue;
      const s = wrapRad(peaks[j].phase - peaks[i].phase) / dx;
      consider(peaks[i].phase - s * peaks[i].x, s);
    }
  }
  const inliers = peaks
    .filter((g) => Math.abs(wrapRad(g.phase - (best.c + best.s * g.x))) < tol)
    .map((g) => ({ ...g, phase: best.c + best.s * g.x + wrapRad(g.phase - (best.c + best.s * g.x)) }));
  const fit = lineFit(inliers);
  return Math.abs(fit.s) > limit ? lineFit(inliers, true) : fit;
}

/**
 * 重み付きで phase = c + s·x を当てる。
 * ピーク (3つ以上) の広がりが全幅の 5% 未満なら傾きは決められないので、平均だけにする
 */
function lineFit(list: PeakPhase[], flat = false) {
  let w = 0;
  let mx = 0;
  let my = 0;
  for (const g of list) {
    w += g.weight;
    mx += g.weight * g.x;
    my += g.weight * g.phase;
  }
  mx /= w;
  my /= w;
  let sxx = 0;
  let sxy = 0;
  for (const g of list) {
    sxx += g.weight * (g.x - mx) ** 2;
    sxy += g.weight * (g.x - mx) * (g.phase - my);
  }
  if (flat || list.length < 3 || Math.sqrt(sxx / w) < 0.05) return { c: my, s: 0 };
  const s = sxy / sxx;
  return { c: my - s * mx, s };
}

/**
 * ACME (1次微分のエントロピー + 負の値への罰則を最小にする。Chen et al., J. Magn. Reson. 2002, 158, 164)。
 * 0次を粗く探してから、0次と1次を Nelder–Mead で詰める。雑音程度の負の値は罰しない。
 */
function acmePhase(spec: Spectrum, pivot: number): { ph0: number; ph1: number } {
  const score = acmeScore(spec, pivot);
  const ph0 = acmePh0(spec, pivot, 0);
  // 装置の遅れは補正済みなので、1次位相は小さいはず。半周期より先は同じ見た目の繰り返しなので探さない
  const limit = spec.period / 2;
  const result = nelderMead(([a, b]) => score(a, b) + (Math.abs(b) > limit ? (Math.abs(b) - limit) / 10 : 0), [ph0, 0], [6, 20], 120);
  return { ph0: wrap(result[0]), ph1: Math.max(-limit, Math.min(limit, result[1])) };
}

/** 1次位相を決めたときの 0次位相 (ACME が最小になるもの) */
function acmePh0(spec: Spectrum, pivot: number, ph1: number): number {
  const score = acmeScore(spec, pivot);
  let best = { ph0: 0, value: Infinity };
  for (let p0 = -180; p0 < 180; p0 += 5) {
    const v = score(p0, ph1);
    if (v < best.value) best = { ph0: p0, value: v };
  }
  for (let step = 2.5; step >= 0.1; step /= 2) {
    for (const p0 of [best.ph0 - step, best.ph0 + step]) {
      const v = score(p0, ph1);
      if (v < best.value) best = { ph0: p0, value: v };
    }
  }
  return wrap(best.ph0);
}

function acmeScore(spec: Spectrum, pivot: number) {
  // 速くするため、長いスペクトルは間引いて評価する
  const step = Math.max(1, Math.floor(spec.re.length / 32768));
  const sub: Spectrum =
    step === 1
      ? spec
      : {
          re: spec.re.filter((_, i) => i % step === 0),
          im: spec.im.filter((_, i) => i % step === 0),
          first: spec.first,
          last: spec.first + ((spec.last - spec.first) * (Math.ceil(spec.re.length / step) * step - step)) / (spec.re.length - 1),
          period: spec.period,
        };
  let scale = 0;
  for (let r = 0; r < sub.re.length; r++) scale = Math.max(scale, Math.hypot(sub.re[r], sub.im[r]));
  scale ||= 1;
  const threshold = noiseLevel(sub.re) * 3;
  return (p0: number, p1: number) => acme(phaseReal(sub, p0, p1, pivot), scale, threshold);
}

function acme(real: Float64Array, scale: number, threshold: number): number {
  const n = real.length;
  let sum = 0;
  for (let r = 1; r < n; r++) sum += Math.abs(real[r] - real[r - 1]);
  if (!sum) return Infinity;
  let entropy = 0;
  let penalty = 0;
  for (let r = 1; r < n; r++) {
    const p = Math.abs(real[r] - real[r - 1]) / sum;
    if (p > 0) entropy -= p * Math.log(p);
  }
  for (let r = 0; r < n; r++) {
    if (real[r] < -threshold) {
      const v = (real[r] + threshold) / scale;
      penalty += v * v;
    }
  }
  return entropy + 1000 * penalty;
}

/** 隣の点との差から見積もった雑音の標準偏差 */
function noiseLevel(y: ArrayLike<number>) {
  const diffs: number[] = [];
  for (let i = 1; i < y.length; i += 3) diffs.push(Math.abs(y[i] - y[i - 1]));
  diffs.sort((a, b) => a - b);
  return (1.4826 * diffs[Math.floor(diffs.length / 2)]) / Math.SQRT2 || 1e-12;
}

function wrapRad(a: number) {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

function wrap(d: number) {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

function nelderMead(f: (x: number[]) => number, x0: number[], steps: number[], iterations: number): number[] {
  const dim = x0.length;
  let simplex = [x0, ...steps.map((s, i) => x0.map((v, k) => (k === i ? v + s : v)))].map((x) => ({ x, v: f(x) }));
  for (let it = 0; it < iterations; it++) {
    simplex.sort((a, b) => a.v - b.v);
    const centroid = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) for (let k = 0; k < dim; k++) centroid[k] += simplex[i].x[k] / dim;
    const worst = simplex[dim];
    const at = (t: number) => centroid.map((c, k) => c + t * (worst.x[k] - c));
    const reflect = { x: at(-1), v: 0 };
    reflect.v = f(reflect.x);
    if (reflect.v < simplex[0].v) {
      const expand = { x: at(-2), v: 0 };
      expand.v = f(expand.x);
      simplex[dim] = expand.v < reflect.v ? expand : reflect;
    } else if (reflect.v < simplex[dim - 1].v) {
      simplex[dim] = reflect;
    } else {
      const contract = { x: at(0.5), v: 0 };
      contract.v = f(contract.x);
      if (contract.v < worst.v) simplex[dim] = contract;
      else {
        const b = simplex[0].x;
        simplex = simplex.map((p, i) => {
          if (i === 0) return p;
          const x = p.x.map((v, k) => b[k] + 0.5 * (v - b[k]));
          return { x, v: f(x) };
        });
      }
    }
  }
  simplex.sort((a, b) => a.v - b.v);
  return simplex[0].x;
}

function deg(a: number) {
  return (a * 180) / Math.PI;
}

function rad(d: number) {
  return (d * Math.PI) / 180;
}

/**
 * ベースライン補正。区間ごとの中央値に多項式を当て、多項式より上の点 (ピーク) を
 * 多項式の値に置き換えながら繰り返す (modpoly)。
 */
export function correctBaseline(y: Float64Array, order = 5): Float64Array {
  const n = y.length;
  const blocks = Math.min(1024, n);
  const size = n / blocks;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let b = 0; b < blocks; b++) {
    const i0 = Math.floor(b * size);
    const i1 = Math.max(i0 + 1, Math.floor((b + 1) * size));
    const part = Array.from(y.subarray(i0, i1)).sort((p, q) => p - q);
    xs.push(((i0 + i1) / 2 / n) * 2 - 1);
    ys.push(part[Math.floor(part.length / 2)]);
  }
  let w = ys.slice();
  let coef = polyfit(xs, w, order);
  for (let it = 0; it < 30; it++) {
    const fit = xs.map((x) => polyval(coef, x));
    w = w.map((v, i) => Math.min(v, fit[i]));
    coef = polyfit(xs, w, order);
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] - polyval(coef, ((i + 0.5) / n) * 2 - 1);
  return out;
}

/** ルジャンドル多項式で最小二乗 (x は -1〜1) */
function polyfit(xs: number[], ys: number[], order: number): number[] {
  const m = order + 1;
  const a = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < xs.length; i++) {
    const p = legendre(xs[i], order);
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) a[r][c] += p[r] * p[c];
      a[r][m] += p[r] * ys[i];
    }
  }
  // ガウスの消去法
  for (let c = 0; c < m; c++) {
    let pivot = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    if (Math.abs(a[c][c]) < 1e-12) continue;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const k = a[r][c] / a[c][c];
      for (let q = c; q <= m; q++) a[r][q] -= k * a[c][q];
    }
  }
  return a.map((row, r) => (Math.abs(row[r]) < 1e-12 ? 0 : row[m] / row[r]));
}

function legendre(x: number, order: number): number[] {
  const p = [1, x];
  for (let k = 2; k <= order; k++) p.push(((2 * k - 1) * x * p[k - 1] - (k - 1) * p[k - 2]) / k);
  return p.slice(0, order + 1);
}

function polyval(coef: number[], x: number) {
  const p = legendre(x, coef.length - 1);
  return coef.reduce((s, c, i) => s + c * p[i], 0);
}

/** 位相補正とベースライン補正をして、表示用の実数のスペクトルにする */
export function finish(spec: Spectrum, p: Processing): Float32Array {
  let real = phaseReal(spec, p.ph0, p.ph1, p.pivot);
  if (p.baseline) real = correctBaseline(real);
  return Float32Array.from(real);
}

/** 基数2の FFT (その場で書き換える) */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * 溶媒ピークで基準を合わせるときのずれ (ppm)。expected (研究室の基準値) の近くの、
 * はっきりしたピークのうち一番近い線を溶媒とみなす (13C の三重線などは中央の線が一番近い)。
 */
export function referenceShift(real: ArrayLike<number>, first: number, last: number, expected: number, nucleus: string): number | null {
  const n = real.length;
  const w = nucleus === '1H' ? 0.1 : 0.5;
  const toIndex = (ppm: number) => ((ppm - first) / (last - first)) * (n - 1);
  const i0 = Math.max(2, Math.floor(Math.min(toIndex(expected - w), toIndex(expected + w))));
  const i1 = Math.min(n - 3, Math.ceil(Math.max(toIndex(expected - w), toIndex(expected + w))));
  if (i1 <= i0) return null;
  let top = 0;
  for (let i = i0; i <= i1; i++) top = Math.max(top, real[i]);
  const diffs: number[] = [];
  for (let i = 1; i < n; i += 7) diffs.push(Math.abs(real[i] - real[i - 1]));
  diffs.sort((a, b) => a - b);
  const noise = (1.4826 * diffs[Math.floor(diffs.length / 2)]) / Math.SQRT2;
  if (top < noise * 20) return null;
  let best: number | null = null;
  for (let i = i0; i <= i1; i++) {
    const v = real[i];
    if (v < top * 0.2 || !(v > real[i - 1] && v >= real[i + 1] && v >= real[i - 2] && v >= real[i + 2])) continue;
    const a = real[i - 1];
    const c = real[i + 1];
    const denom = a - 2 * v + c;
    const frac = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    const ppm = first + ((last - first) * (i + frac)) / (n - 1);
    if (best === null || Math.abs(ppm - expected) < Math.abs(best - expected)) best = ppm;
  }
  return best === null ? null : expected - best;
}
