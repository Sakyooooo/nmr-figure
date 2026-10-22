import * as OCL from 'openchemlib';
import { describe, expect, it } from 'vitest';
import { analyzeHydrogens, autoNumber, cdxmlGraph, type HAnalysis } from './protonNumbering';

const { Molecule } = OCL;

/**
 * SMILES → ChemDraw と同じ形の CDXML (文字のない炭素、ヘテロ原子は文字と NumHydrogens、くさび)。
 * 座標は OpenChemLib が作る (結合の長さ 1 → 14.4 pt)
 */
function cdxmlOf(smiles: string): string {
  const m = Molecule.fromSmiles(smiles);
  m.inventCoordinates();
  m.ensureHelperArrays(Molecule.cHelperParities);
  m.setStereoBondsFromParity();
  m.ensureHelperArrays(Molecule.cHelperNeighbours);
  const k = 14.4 / (m.getAverageBondLength(true) || 1);
  const nodes: string[] = [];
  for (let i = 0; i < m.getAtoms(); i++) {
    const el = m.getAtomicNo(i);
    const p = `p="${(m.getAtomX(i) * k + 100).toFixed(2)} ${(m.getAtomY(i) * k + 100).toFixed(2)}"`;
    if (el === 6 && !m.getAtomCharge(i)) nodes.push(`<n id="${i + 1}" ${p}/>`);
    else {
      const label = Molecule.cAtomLabel[el];
      const h = m.getImplicitHydrogens(i);
      nodes.push(
        `<n id="${i + 1}" ${p} Element="${el}" NumHydrogens="${h}"${m.getAtomCharge(i) ? ` Charge="${m.getAtomCharge(i)}"` : ''}><t><s>${label}${h ? 'H' : ''}${h > 1 ? h : ''}</s></t></n>`,
      );
    }
  }
  const bonds: string[] = [];
  for (let b = 0; b < m.getBonds(); b++) {
    const t = m.getBondType(b);
    const order = m.getBondOrder(b);
    const disp = t === Molecule.cBondTypeUp ? ' Display="WedgeBegin"' : t === Molecule.cBondTypeDown ? ' Display="WedgedHashBegin"' : '';
    bonds.push(`<b id="${1000 + b}" B="${m.getBondAtom(0, b) + 1}" E="${m.getBondAtom(1, b) + 1}"${order > 1 ? ` Order="${order}"` : ''}${disp}/>`);
  }
  return `<?xml version="1.0"?><CDXML><page id="500"><fragment id="600">${nodes.join('')}${bonds.join('')}</fragment></page></CDXML>`;
}

const analyze = (smiles: string) => analyzeHydrogens(cdxmlOf(smiles), OCL);

/** 環境ごとの H の数 (多い順) */
function envCounts(a: HAnalysis) {
  const n = new Map<number, number>();
  for (const s of a.sites) n.set(s.env, (n.get(s.env) ?? 0) + s.count);
  return [...n.values()].sort((p, q) => q - p);
}

describe('H のまとまり (環境)', () => {
  it('エタノール: CH3・CH2・OH の 3 つ (CH2 の 2 つの H は同じ)', () => {
    const a = analyze('CCO');
    expect(envCounts(a)).toEqual([3, 2, 1]);
    expect(a.sites).toHaveLength(3);
  });

  it('2-ブタノール: 不斉中心の隣の CH2 の 2 つの H は別 (同じ炭素に 2 か所)', () => {
    const a = analyze('CCC(C)O');
    expect(envCounts(a)).toEqual([3, 3, 1, 1, 1, 1]);
    const ch2 = a.sites.filter((s) => s.key.includes('#'));
    expect(ch2).toHaveLength(2);
    expect(new Set(ch2.map((s) => s.atomId)).size).toBe(1);
  });

  it('パラ置換ベンゼン: 対称な H は同じ環境 (原子は別)', () => {
    const a = analyze('COc1ccc(C)cc1');
    expect(envCounts(a)).toEqual([3, 3, 2, 2]);
    const ring = a.sites.filter((s) => s.count === 1);
    expect(ring).toHaveLength(4);
    expect(new Set(ring.map((s) => s.env)).size).toBe(2);
  });

  it('末端のアルケン =CH2 の 2 つの H は別', () => {
    const a = analyze('C=CC(=O)OC');
    expect(envCounts(a)).toEqual([3, 1, 1, 1]);
  });

  it('立体を描いた分子 (くさび) でも読める', () => {
    const a = analyze('C[C@H](N)C(=O)O');
    expect(envCounts(a)).toEqual([3, 2, 1, 1]);
  });

  it('アンモニウム (N+) は ChemDraw の H の数のまま', () => {
    const a = analyze('C[NH3+]');
    expect(envCounts(a)).toEqual([3, 3]);
  });
});

describe('ChemDraw の略号・描いた H・金属', () => {
  // ChemDraw が書く形: 略号 (NodeType="Fragment") の中に断片があり、外とつなぐ点 (ExternalConnectionPoint) で外の結合とつながる
  const ome = `<n id="20" p="160 100" NodeType="Fragment"><fragment id="21"><n id="22" p="160 100" Element="8" NumHydrogens="0"/><n id="23" p="170 100"/><n id="24" p="150 100" NodeType="ExternalConnectionPoint" ExternalConnectionNum="1"/><b id="25" B="22" E="23"/><b id="26" B="24" E="22"/></fragment><t><s>OMe</s></t></n>`;

  it('略号の中の原子まで開き、H は略号の原子に付ける', () => {
    // CH3-CH2-OMe
    const cdxml = `<CDXML><page><fragment id="1"><n id="10" p="120 100"/><n id="11" p="140 100"/>${ome}<b id="30" B="10" E="11"/><b id="31" B="11" E="20"/></fragment></page></CDXML>`;
    const g = cdxmlGraph(cdxml);
    expect(g.atoms.map((x) => `${x.id}:${x.display}`)).toEqual(['10:10', '11:11', '22:20', '23:20']);
    const a = analyzeHydrogens(cdxml, OCL);
    expect(a.sites.map((s) => `${s.atomId}:${s.count}`).sort()).toEqual(['10:3', '11:2', '20:3']);
  });

  it('描いてある H (くさびの H) はその H に番号を付ける', () => {
    // CH3-CH(OH)-CH2CH3 の CH の H を描いた形
    const cdxml = `<CDXML><page><fragment id="1"><n id="1" p="100 100"/><n id="2" p="114 92"/><n id="3" p="128 100"/><n id="4" p="142 92"/><n id="5" p="114 78" Element="8" NumHydrogens="1"><t><s>OH</s></t></n><n id="6" p="120 106" Element="1" NumHydrogens="0"><t><s>H</s></t></n><b id="7" B="1" E="2"/><b id="8" B="2" E="3"/><b id="9" B="3" E="4"/><b id="10" B="2" E="5"/><b id="11" B="2" E="6" Display="WedgedHashBegin"/></fragment></page></CDXML>`;
    const a = analyzeHydrogens(cdxml, OCL);
    const drawn = a.sites.filter((s) => s.drawn);
    expect(drawn).toEqual([expect.objectContaining({ key: '6', atomId: '6', parent: '2', count: 1 })]);
    expect(envCounts(a)).toEqual([3, 3, 1, 1, 1, 1]);
  });

  it('金属の錯体: ピリジンの N から金属への結合は配位結合 (ピリジンの CH は H 1 つ)、W-CH3 の CH3 は 3 つ', () => {
    // W(CH3)(py): 金属は文字のある原子
    const ring = [
      [200, 100],
      [212, 93],
      [224, 100],
      [224, 114],
      [212, 121],
      [200, 114],
    ];
    const nodes = ring.map(([x, y], i) => (i === 0 ? `<n id="${i + 1}" p="${x} ${y}" Element="7" NumHydrogens="0"><t><s>N</s></t></n>` : `<n id="${i + 1}" p="${x} ${y}"/>`)).join('');
    const bonds = ring.map((_, i) => `<b id="${20 + i}" B="${i + 1}" E="${((i + 1) % 6) + 1}"${i % 2 ? ' Order="2"' : ''}/>`).join('');
    const cdxml = `<CDXML><page><fragment id="1">${nodes}<n id="9" p="186 93" Element="74" NumHydrogens="0"><t><s>W</s></t></n><n id="10" p="172 100"/>${bonds}<b id="30" B="9" E="1"/><b id="31" B="9" E="10"/></fragment></page></CDXML>`;
    const a = analyzeHydrogens(cdxml, OCL);
    expect(a.sites.find((s) => s.atomId === '10')?.count).toBe(3);
    expect(a.sites.filter((s) => Number(s.atomId) <= 6).map((s) => s.count)).toEqual([1, 1, 1, 1, 1]);
    // ピリジンの CH は o・m・p の 3 環境 + CH3
    expect(envCounts(a)).toEqual([3, 2, 2, 1]);
  });
});

describe('番号の振り方', () => {
  it('同じ環境は同じ番号、環境の違う H は別の番号で、番号は 1 から続けて', () => {
    const a = analyze('COc1ccc(C)cc1');
    const labels = autoNumber(a);
    const byEnv = new Map<number, Set<string>>();
    for (const s of a.sites) {
      if (!byEnv.has(s.env)) byEnv.set(s.env, new Set());
      byEnv.get(s.env)!.add(labels[s.key]);
    }
    for (const set of byEnv.values()) expect(set.size).toBe(1);
    expect([...new Set(Object.values(labels))].map(Number).sort((p, q) => p - q)).toEqual([1, 2, 3, 4]);
  });

  it('骨格に沿った順 (鎖の端から順に)', () => {
    // ペンタン-1-オール: 端の炭素から 1, 2, 3, 4, 5 (OH が 6 か、OH 側の端から)
    const a = analyze('CCCCCO');
    const labels = autoNumber(a);
    const chain = a.order();
    expect(chain).toHaveLength(6);
    // たどった順に番号が増える
    const seq = chain.map((id) => Number(labels[a.sites.find((s) => s.parent === id)!.key]));
    expect(seq).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('始める原子を選んで振り直す', () => {
    const a = analyze('CCCCCO');
    const first = a.order()[0];
    const last = a.order()[5];
    const labels = autoNumber(a, last);
    expect(labels[a.sites.find((s) => s.parent === last)!.key]).toBe('1');
    expect(labels[a.sites.find((s) => s.parent === first)!.key]).toBe('6');
  });

  it('主鎖を先に、枝はあと (イソブチル基の枝の CH3 は主鎖のあと)', () => {
    // 3-メチルブタン酸メチル: 主鎖 C-O-C(=O)-C-C(-C)-C
    const a = analyze('COC(=O)CC(C)C');
    const labels = autoNumber(a);
    // 2 つの CH3 (枝の末端) は同じ環境なので同じ番号
    const ipr = a.sites.filter((s) => s.count === 3);
    expect(ipr).toHaveLength(3);
    expect(new Set(Object.values(labels)).size).toBe(4);
  });
});
