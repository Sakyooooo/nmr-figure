/**
 * ChemDraw の構造式の H に番号を振る (本人の希望 2026-10-22。¹H NMR で帰属するため)。
 *  - 番号は H のまとまり (同じ環境の H) ごとに 1 つ。対称で同じ H は同じ番号、同じ炭素でも環境が違う H
 *    (不斉中心の隣の CH₂、=CH₂ など) は別の番号。環境の見分けは OpenChemLib の diastereotopic な ID
 *  - 番号の順は骨格に沿ってたどった順: 端の原子から一番長い道をたどり、そのあと枝 (枝の中も同じ)
 * OpenChemLib は大きい (1 MB) ので、使うときに読み込む。ここの関数は読み込んだものを受け取る
 */
import type * as OCLModule from 'openchemlib';
import type { HSite } from '../state/types';
import { readCdxml } from './cdxml';
import { elements, firstElement, type XNode } from './xml';

export type Ocl = typeof OCLModule;

/** 構造式の原子 (略号 OMe・CF3 などの中の原子も)。CDXML の座標 (pt) */
interface GAtom {
  /** CDXML の原子の id */
  id: string;
  /** 図で見えている原子 (略号の中の原子なら略号の原子) の id */
  display: string;
  element: number;
  charge: number;
  isotope: number;
  /** 文字の原子の H の数 (ChemDraw が書いたもの)。文字のない炭素は null (原子価から) */
  numH: number | null;
  x: number;
  y: number;
}

interface GBond {
  /** くさびなら a が細い側 (立体中心) */
  a: string;
  b: string;
  order: number;
  stereo: 'up' | 'down' | null;
  /** 配位結合として描いたもの */
  dative: boolean;
}

export interface CdxGraph {
  atoms: GAtom[];
  bonds: GBond[];
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};
const nums = (v: string | undefined) => (v ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);

/** 構造式を原子と結合の表にする (略号は中の原子まで開く。R などの中身のない略号は 0 番の原子) */
export function cdxmlGraph(cdxml: string): CdxGraph {
  const atoms: GAtom[] = [];
  const bonds: GBond[] = [];
  const root = readCdxml(cdxml);
  const visit = (node: XNode) => {
    for (const el of elements(node)) {
      if (el.attrs.Visible === 'no' || el.attrs.SupersededBy) continue;
      if (el.name === 'fragment') readFragment(el, null, atoms, bonds);
      else if (el.name === 'page' || el.name === 'group') visit(el);
    }
  };
  if (root) visit(root);
  return { atoms, bonds };
}

const ABBREVIATION_TYPES = new Set(['Fragment', 'Nickname', 'Unspecified', 'GenericNickname']);

/**
 * 断片を読む。outer は略号の原子 (その中の断片を読むとき。中の原子は略号の位置に置く)。
 * 返り値は外とつなぐ点 (ExternalConnectionPoint の番号 → それにつながる中の原子の id)
 */
function readFragment(frag: XNode, outer: { display: string; x: number; y: number } | null, atoms: GAtom[], bonds: GBond[]): Map<number, string> {
  const external = new Map<string, number>();
  /** 略号の原子 → (外とつなぐ点の番号 → 中の原子) */
  const inner = new Map<string, Map<number, string>>();
  const skip = new Set<string>();
  for (const n of elements(frag, 'n')) {
    const id = n.attrs.id;
    const type = n.attrs.NodeType;
    if (type === 'ExternalConnectionPoint') {
      external.set(id, num(n.attrs.ExternalConnectionNum, external.size + 1));
      continue;
    }
    // 複数の原子への結合 (Cp の η⁵ など) の点は原子ではない
    if (type === 'MultiAttachment' || type === 'VariableAttachment' || n.attrs.Visible === 'no') {
      skip.add(id);
      continue;
    }
    const p = nums(n.attrs.p);
    const x = outer ? outer.x : (p[0] ?? 0);
    const y = outer ? outer.y : (p[1] ?? 0);
    const display = outer ? outer.display : id;
    const sub = firstElement(n, 'fragment');
    if (sub && type && ABBREVIATION_TYPES.has(type)) {
      inner.set(id, readFragment(sub, { display, x, y }, atoms, bonds));
      continue;
    }
    // 中身のない略号 (R・X・Ar など) は 0 番の原子 (H は付かない)
    const generic = !!type && type !== 'Element';
    atoms.push({
      id,
      display,
      element: generic ? 0 : num(n.attrs.Element, 6),
      charge: num(n.attrs.Charge, 0),
      isotope: num(n.attrs.Isotope, 0),
      numH: generic ? 0 : n.attrs.NumHydrogens !== undefined ? num(n.attrs.NumHydrogens, 0) : null,
      x,
      y,
    });
  }
  const ends = new Map<number, string>();
  const resolve = (id: string, extNum: string | undefined): string | null => {
    if (skip.has(id)) return null;
    const m = inner.get(id);
    if (!m) return id;
    return m.get(num(extNum, 1)) ?? m.values().next().value ?? null;
  };
  for (const b of elements(frag, 'b')) {
    if (b.attrs.Visible === 'no') continue;
    const B = b.attrs.B;
    const E = b.attrs.E;
    // 外とつなぐ点への結合: その相手が外とつながる原子
    if (external.has(B) || external.has(E)) {
      const atB = external.has(B);
      const at = resolve(atB ? E : B, atB ? b.attrs.EndExternalNum : b.attrs.BeginExternalNum);
      if (at) ends.set(external.get(atB ? B : E)!, at);
      continue;
    }
    const a = resolve(B, b.attrs.BeginExternalNum);
    const e = resolve(E, b.attrs.EndExternalNum);
    if (!a || !e) continue;
    const ord = (b.attrs.Order ?? '1').trim().split(/\s+/)[0];
    if (ord === 'hydrogen' || ord === 'ionic' || ord === '0.5' || ord === 'half') continue;
    const order = ord === '2' ? 2 : ord === '3' ? 3 : ord === '1.5' ? 1.5 : ord === '4' ? 4 : 1;
    const d = b.attrs.Display ?? '';
    const stereo = d === 'WedgeBegin' || d === 'WedgeEnd' ? 'up' : d === 'WedgedHashBegin' || d === 'WedgedHashEnd' ? 'down' : null;
    // くさびの細い側が立体中心: ...Begin は B、...End は E
    const flip = stereo !== null && d.endsWith('End');
    bonds.push({ a: flip ? e : a, b: flip ? a : e, order, stereo, dative: ord === 'dative' });
  }
  return ends;
}

export interface HAnalysis {
  sites: HSite[];
  /** 骨格をたどった順の、H のある原子 (見えている原子の id、重なりなし)。start は始める原子 */
  order: (start?: string) => string[];
}

const VALENCE: Record<number, number> = { 5: 3, 6: 4, 7: 3, 8: 2, 14: 4, 15: 3, 16: 2, 34: 2 };

/** 金属への結合を配位結合とみなすか: 金属でない側の原子が、ほかの結合と H だけで原子価を満たしているとき (ピリジンの N、PR₃ など) */
function saturated(atom: GAtom, others: number): boolean {
  const v = VALENCE[atom.element];
  if (v === undefined) return true;
  // N⁺・O⁺ は 1 つ多く、C⁻ は 1 つ少なく結合する
  const onium = atom.element === 7 || atom.element === 8 || atom.element === 15 || atom.element === 16 || atom.element === 34;
  const valence = onium ? v + atom.charge : v - Math.abs(atom.charge);
  return others + (atom.numH ?? 0) >= valence;
}

/** 構造式から H のまとまりを求める */
export function analyzeHydrogens(cdxml: string, ocl: Ocl): HAnalysis {
  const g = cdxmlGraph(cdxml);
  const { Molecule } = ocl;
  const mol = new Molecule(g.atoms.length, g.bonds.length);
  const index = new Map<string, number>();
  for (const a of g.atoms) {
    const i = mol.addAtom(a.element);
    mol.setAtomX(i, a.x);
    mol.setAtomY(i, a.y);
    if (a.charge) mol.setAtomCharge(i, a.charge);
    if (a.isotope) mol.setAtomMass(i, a.isotope);
    index.set(a.id, i);
  }
  const byId = new Map(g.atoms.map((a) => [a.id, a]));
  const isMetal = (a: GAtom) => mol.isMetalAtom(index.get(a.id)!);
  // 金属以外への結合の次数の和 (金属への結合が配位結合かを見分ける)
  const used = new Map<string, number>();
  for (const b of g.bonds) {
    const A = byId.get(b.a)!;
    const B = byId.get(b.b)!;
    if (isMetal(A) || isMetal(B) || b.dative) continue;
    used.set(A.id, (used.get(A.id) ?? 0) + b.order);
    used.set(B.id, (used.get(B.id) ?? 0) + b.order);
  }
  for (const b of g.bonds) {
    const A = byId.get(b.a)!;
    const B = byId.get(b.b)!;
    const i = mol.addBond(index.get(b.a)!, index.get(b.b)!);
    const ligand = isMetal(A) ? B : isMetal(B) ? A : null;
    if (b.dative || (ligand && !isMetal(ligand) && saturated(ligand, Math.ceil(used.get(ligand.id) ?? 0)))) {
      mol.setBondType(i, Molecule.cBondTypeMetalLigand);
    } else if (b.stereo && b.order === 1) {
      mol.setBondType(i, b.stereo === 'up' ? Molecule.cBondTypeUp : Molecule.cBondTypeDown);
    } else {
      const type = b.order === 2 ? Molecule.cBondTypeDouble : b.order === 3 ? Molecule.cBondTypeTriple : b.order === 1.5 ? Molecule.cBondTypeDelocalized : Molecule.cBondTypeSingle;
      mol.setBondType(i, type);
    }
  }
  // 描いてある H は OpenChemLib が後ろへ並べ替える (その対応)
  let map = mol.getHandleHydrogenMap();
  const idx = (id: string) => map[index.get(id)!];
  mol.ensureHelperArrays(Molecule.cHelperNeighbours);
  // 文字の原子は ChemDraw の H の数に合わせる (原子価から求めた数と違うとき)
  for (const a of g.atoms) {
    if (a.numH === null || a.element <= 1) continue;
    const i = idx(a.id);
    if (mol.getImplicitHydrogens(i) !== a.numH) {
      mol.setAtomAbnormalValence(i, mol.getOccupiedValence(i) + a.numH);
      mol.ensureHelperArrays(Molecule.cHelperNeighbours);
    }
  }
  mol.addImplicitHydrogens();
  const map2 = mol.getHandleHydrogenMap();
  map = map.map((v: number) => map2[v] ?? v);
  mol.ensureHelperArrays(Molecule.cHelperNeighbours);
  const ids = mol.getDiastereotopicAtomIDs();

  // OpenChemLib の原子 → 構造式の原子
  const back = new Map<number, GAtom>();
  for (const a of g.atoms) back.set(idx(a.id), a);
  const envNames: string[] = [];
  const envNo = (s: string) => {
    let k = envNames.indexOf(s);
    if (k < 0) k = envNames.push(s) - 1;
    return k;
  };
  /** 見えている原子 → 環境 → H の数 */
  const perAtom = new Map<string, Map<number, number>>();
  /** H のある原子 (OpenChemLib の番号) */
  const withH = new Set<number>();
  const sites: HSite[] = [];
  for (let h = 0; h < mol.getAllAtoms(); h++) {
    if (mol.getAtomicNo(h) !== 1 || mol.getAllConnAtoms(h) < 1) continue;
    const heavy = mol.getConnAtom(h, 0);
    const owner = back.get(heavy);
    if (!owner) continue;
    withH.add(heavy);
    const env = envNo(ids[h]);
    const drawn = back.get(h);
    if (drawn) {
      sites.push({ key: drawn.display, atomId: drawn.display, parent: owner.display, drawn: true, env, count: 1 });
      continue;
    }
    if (!perAtom.has(owner.display)) perAtom.set(owner.display, new Map());
    const m = perAtom.get(owner.display)!;
    m.set(env, (m.get(env) ?? 0) + 1);
  }
  for (const [atomId, m] of perAtom) {
    // 同じ原子の中の環境の並び: 環境の名前 (OpenChemLib の ID) の順 (振り直しても同じ)
    const envs = [...m.keys()].sort((p, q) => (envNames[p] < envNames[q] ? -1 : envNames[p] > envNames[q] ? 1 : 0));
    envs.forEach((env, k) => sites.push({ key: envs.length > 1 ? `${atomId}#${k}` : atomId, atomId, parent: atomId, drawn: false, env, count: m.get(env)! }));
  }

  // 骨格をたどる順 (H 以外の原子)
  const heavyAtoms: number[] = [];
  for (let i = 0; i < mol.getAllAtoms(); i++) if (mol.getAtomicNo(i) !== 1 || !mol.getAllConnAtoms(i)) heavyAtoms.push(i);
  const nb = (i: number) => {
    const out: number[] = [];
    for (let k = 0; k < mol.getAllConnAtoms(i); k++) {
      const j = mol.getConnAtom(i, k);
      if (mol.getAtomicNo(j) !== 1) out.push(j);
    }
    return out;
  };
  const pos = (i: number) => back.get(i) ?? { x: mol.getAtomX(i), y: mol.getAtomY(i) };
  const order = (start?: string) => {
    let first: number | undefined;
    const site = start ? sites.find((s) => s.atomId === start) : undefined;
    const a = start ? g.atoms.find((x) => x.display === (site?.parent ?? start) && x.element > 1 && withH.has(idx(x.id))) ?? g.atoms.find((x) => x.display === start) : undefined;
    if (a) first = idx(a.id);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const i of walkSkeleton(heavyAtoms, nb, pos, first)) {
      const at = back.get(i);
      if (!at || seen.has(at.display) || !withH.has(i)) continue;
      seen.add(at.display);
      out.push(at.display);
    }
    return out;
  };
  return { sites, order };
}

/**
 * 骨格をたどる順。始めの原子 (無ければ一番端の原子: 一番遠い原子までの距離が最大のもの、同じなら左・上) から、
 * 深さ優先でたどった木の一番長い道を先に、そのあと道の上の原子から出る枝を (枝の中も同じように) たどる。
 * つながっていない部分 (塩・2 つの分子) は、左のものから順に同じように
 */
export function walkSkeleton(atoms: number[], nb: (i: number) => number[], pos: (i: number) => { x: number; y: number }, start?: number): number[] {
  const left = new Set(atoms);
  const out: number[] = [];
  const byPlace = (p: number, q: number) => pos(p).x - pos(q).x || pos(p).y - pos(q).y;
  let first = start !== undefined && left.has(start) ? start : undefined;
  while (left.size) {
    const comp = component(first ?? [...left].sort(byPlace)[0], nb);
    const s = first ?? endAtom(comp, nb, byPlace);
    first = undefined;
    // 深さ優先の木 (となりは左・上の順に)
    const children = new Map<number, number[]>([[s, []]]);
    const stack: [number, number[]][] = [[s, nb(s).sort(byPlace)]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = top[1].find((j) => !children.has(j));
      if (next === undefined) {
        stack.pop();
        continue;
      }
      children.get(top[0])!.push(next);
      children.set(next, []);
      stack.push([next, nb(next).sort(byPlace)]);
    }
    // 深さ (葉から。深い木でも再帰しない)
    const depth = new Map<number, number>();
    const post: number[] = [];
    const todo = [s];
    while (todo.length) {
      const u = todo.pop()!;
      post.push(u);
      todo.push(...children.get(u)!);
    }
    for (const u of post.reverse()) depth.set(u, 1 + Math.max(0, ...children.get(u)!.map((c) => depth.get(c)!)));
    // 一番長い道を先に、そのあと枝
    const queue = [s];
    while (queue.length) {
      const v = queue.shift()!;
      const path = [v];
      for (let u = v; children.get(u)!.length; ) {
        u = children.get(u)!.reduce((p, c) => (depth.get(c)! > depth.get(p)! ? c : p));
        path.push(u);
      }
      out.push(...path);
      const branches = path.flatMap((u) => children.get(u)!.filter((c) => !path.includes(c)));
      queue.unshift(...branches);
    }
    for (const v of comp) left.delete(v);
  }
  return out;
}

function component(s: number, nb: (i: number) => number[]): number[] {
  const seen = new Set([s]);
  const q = [s];
  while (q.length) {
    for (const j of nb(q.shift()!)) {
      if (seen.has(j)) continue;
      seen.add(j);
      q.push(j);
    }
  }
  return [...seen];
}

/** 一番端の原子 (一番遠い原子までの距離が最大。同じなら左・上) */
function endAtom(comp: number[], nb: (i: number) => number[], byPlace: (p: number, q: number) => number): number {
  const ecc = (s: number) => {
    const d = new Map([[s, 0]]);
    const q = [s];
    let far = 0;
    while (q.length) {
      const u = q.shift()!;
      for (const j of nb(u)) {
        if (d.has(j)) continue;
        d.set(j, d.get(u)! + 1);
        far = Math.max(far, d.get(j)!);
        q.push(j);
      }
    }
    return far;
  };
  const e = new Map(comp.map((v) => [v, ecc(v)]));
  const best = Math.max(...e.values());
  return comp.filter((v) => e.get(v) === best).sort(byPlace)[0];
}

/**
 * 番号を振る: 骨格をたどった順に、新しい環境の H に 1, 2, 3… (同じ環境はもう振った番号)。
 * 同じ原子の環境の違う H は続けて振る。start は始める原子 (見えている原子・描いてある H の id)
 */
export function autoNumber(a: HAnalysis, start?: string): Record<string, string> {
  const envLabel = new Map<number, string>();
  let next = 1;
  for (const atomId of a.order(start)) {
    const here = a.sites.filter((s) => s.parent === atomId).sort((p, q) => Number(p.drawn) - Number(q.drawn) || (p.key < q.key ? -1 : 1));
    for (const s of here) if (!envLabel.has(s.env)) envLabel.set(s.env, String(next++));
  }
  for (const s of a.sites) if (!envLabel.has(s.env)) envLabel.set(s.env, String(next++));
  return Object.fromEntries(a.sites.map((s) => [s.key, envLabel.get(s.env)!]));
}
