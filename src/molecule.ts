// A molecule as plain data: atoms (element, charge, hydrogens, lone pairs, 2D position) and bonds (order, wedge or
// dash), read from SMILES by RDKit and checked here. Positions are in bond lengths, y up; drawing scales and flips.
import {RD} from './rdkit.ts';

export type Vec = [number, number];
export type Atom = {el: string; charge: number; h: number; pairs: number; radical: number; at: Vec;
  /** R or S at a stereo centre (CIP). */ cip?: 'R' | 'S'};
/** `stereo` is drawn from atom a (the narrow end) to atom b. */
export type Bond = {a: number; b: number; order: 1 | 2 | 3; stereo?: 'wedge' | 'dash'; cip?: 'E' | 'Z'};
export type Molecule = {smiles: string; formula: string; charge: number; atoms: Atom[]; bonds: Bond[]; rings: number[][]};

/** Valence electrons of the main-group elements a school course meets. */
export const VALENCE: Record<string, number> = {H: 1, D: 1, T: 1, Li: 1, Na: 1, K: 1, Be: 2, Mg: 2, Ca: 2, B: 3,
  Al: 3, C: 4, Si: 4, Ge: 4, Sn: 4, N: 5, P: 5, As: 5, Sb: 5, O: 6, S: 6, Se: 6, Te: 6, F: 7, Cl: 7, Br: 7, I: 7,
  He: 2, Ne: 8, Ar: 8, Kr: 8, Xe: 8, Rn: 8};
/** Period-2 atoms never hold more than eight electrons. */
const OCTET = new Set(['B', 'C', 'N', 'O', 'F']);
const SYMBOLS = ['', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr',
  'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce',
  'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt',
  'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf',
  'Es', 'Fm', 'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og'];

type RdJson = {molecules: {atoms: {z?: number; impHs?: number; chg?: number; nRad?: number; isotope?: number}[];
  bonds: {bo?: number; atoms: [number, number]; stereo?: string}[];
  extensions?: {name: string; cipCodes?: [number, string][]}[]}[]};

/** p-block atoms from period 3 down may hold more than eight electrons (ClF3, BrF5, IF7, KrF2): RDKit's valence
 * table refuses many of them, so they are checked by electron count instead. */
const EXPANDS = new Set(['Al', 'Si', 'P', 'S', 'Cl', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Rn']);
const ATOM_TOKEN = /\[[^\]]+\]|Cl|Br|[BCNOSPFI]|[bcnosp]|\*/g;

/** RDKit's molecule, and the atoms that expand their octet when RDKit's valence table had to be set aside. When it
 * is, every other atom is still checked by RDKit (the expanding ones stand in as `*`) and each expanding one by
 * electron count: its bonds, hydrogens and charge may not need more valence electrons than it has. */
function parse(smiles: string) {
  const checked = RD.get_mol(smiles);
  if (checked) return {m: checked, expanded: new Set<number>()};
  const element = (token: string) => token.startsWith('[') ? token.match(/^\[\d*([A-Z][a-z]?)/)?.[1] : token;
  if (!(smiles.match(ATOM_TOKEN) ?? []).some(t => EXPANDS.has(element(t) ?? ''))) return null;
  const rest = RD.get_mol(smiles.replace(ATOM_TOKEN, t => EXPANDS.has(element(t) ?? '') ? '[*]' : t));
  rest?.delete();
  const raw = rest ? RD.get_mol(smiles, JSON.stringify({sanitize: false})) : null;
  if (!raw) return null;
  const json = (JSON.parse(raw.get_json()) as RdJson).molecules[0];
  const expanded = new Set<number>();
  for (const [i, a] of json.atoms.entries()) {
    const el = SYMBOLS[a.z ?? 6];
    if (!EXPANDS.has(el)) continue;
    const bonded = json.bonds.reduce((s, b) => s + (b.atoms.includes(i) ? b.bo ?? 1 : 0), 0);
    if (VALENCE[el] - (a.chg ?? 0) - bonded - (a.impHs ?? 0) < 0) { raw.delete(); return null; }
    expanded.add(i);
  }
  return {m: raw, expanded};
}

/** A molecule from SMILES; `hydrogens` makes every H an atom of its own (full structural formulas). */
export function molecule(smiles: string, options: {hydrogens?: boolean} = {}): Molecule {
  const parsed = parse(smiles), m = parsed?.m;
  if (!m || !m.is_valid()) { m?.delete(); throw new Error(`not a molecule: ${smiles}`); }
  try {
    if (options.hydrogens) m.add_hs_in_place();
    // CoordGen first; it leaves a lone atom (H+) at NaN, so then RDKit's own depictor, then the origin
    m.set_new_coords(true);
    if (/nan/i.test(m.get_molblock())) m.set_new_coords(false);
    const canonical = parse(smiles)!.m, can = canonical.get_smiles(); canonical.delete();
    const json = (JSON.parse(m.get_json()) as RdJson).molecules[0];
    const block = m.get_molblock().split('\n');
    const [na, nb] = [Number(block[3].slice(0, 3)), Number(block[3].slice(3, 6))];
    const tags = JSON.parse(m.get_stereo_tags()) as {CIP_atoms: [number, string][]; CIP_bonds: [number, number, string][]};
    const atoms: Atom[] = json.atoms.map((a, i) => {
      const line = block[4 + i];
      // deuterium and tritium are written D and T, as books write them (D2O, ND3)
      const el = a.z === 1 && a.isotope === 2 ? 'D' : a.z === 1 && a.isotope === 3 ? 'T' : SYMBOLS[a.z ?? 6];
      return {el, charge: a.chg ?? 0, h: a.impHs ?? 0, pairs: 0, radical: a.nRad ?? 0,
        at: [Number(line.slice(0, 10)) || 0, Number(line.slice(10, 20)) || 0]};
    });
    for (const [i, c] of tags.CIP_atoms) if (/[RS]/.test(c)) atoms[i].cip = c.includes('R') ? 'R' : 'S';
    if (atoms.length !== na) throw new Error('RDKit atom count and molblock disagree');
    const bonds: Bond[] = [];
    for (let i = 0; i < nb; i++) {
      const line = block[4 + na + i];
      const [a, b, order, flag] = [0, 3, 6, 9].map(o => Number(line.slice(o, o + 3)));
      const bond: Bond = {a: a - 1, b: b - 1, order: Math.min(3, Math.max(1, order)) as 1 | 2 | 3};
      if (flag === 1) bond.stereo = 'wedge';
      if (flag === 6) bond.stereo = 'dash';
      bonds.push(bond);
    }
    // molblock bond orders are Kekulé (benzene 1,2,1,2...): the JSON says the same, so either serves
    for (const [a, b, c] of tags.CIP_bonds) {
      const bond = bonds.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      if (bond && /[EZ]/.test(c)) bond.cip = c.includes('E') ? 'E' : 'Z';
    }
    for (const [i, atom] of atoms.entries()) {
      // an expanded atom read without RDKit's valence table has its odd electron (ClO2) worked out here
      if (parsed.expanded.has(i)) atom.radical = (VALENCE[atom.el] - atom.charge - bondSum(bonds, i) - atom.h) % 2;
      atom.pairs = lonePairs(atom, bondSum(bonds, i));
    }
    const charge = atoms.reduce((s, a) => s + a.charge, 0);
    return {smiles: can, formula: formula(atoms, charge), charge, atoms, bonds, rings: rings(atoms.length, bonds)};
  } finally { m.delete(); }
}

const bondSum = (bonds: Bond[], i: number) => bonds.reduce((s, b) => s + (b.a === i || b.b === i ? b.order : 0), 0);

/** Lone pairs from the valence electrons left over: (V − charge − bonds − H − unpaired) / 2. */
function lonePairs(a: Atom, bonded: number): number {
  const v = VALENCE[a.el];
  if (v === undefined) return 0;
  return Math.max(0, Math.floor((v - a.charge - bonded - a.h - a.radical) / 2));
}

/** Hill order: C, then H, then the rest alphabetically (no carbon: all alphabetically); charge last (C2H3O2⁻). */
export function formula(atoms: Atom[], charge = 0): string {
  const n: Record<string, number> = {};
  for (const a of atoms) { n[a.el] = (n[a.el] ?? 0) + 1; if (a.h) n.H = (n.H ?? 0) + a.h; }
  const order = n.C ? ['C', ...(n.H ? ['H'] : []), ...Object.keys(n).filter(e => e !== 'C' && e !== 'H').sort()]
    : Object.keys(n).sort();
  const sign = charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '-'}` : '';
  return order.map(e => e + (n[e] > 1 ? n[e] : '')).join('') + sign;
}

/** The smallest ring through each ring bond, as atom cycles (each once). */
function rings(n: number, bonds: Bond[]): number[][] {
  const adj: number[][] = Array.from({length: n}, () => []);
  for (const b of bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
  const found = new Map<string, number[]>();
  for (const b of bonds) {
    // shortest path from a to b not using the bond itself
    const prev = new Map<number, number>([[b.a, -1]]), queue = [b.a];
    while (queue.length && !prev.has(b.b)) {
      const u = queue.shift()!;
      for (const v of adj[u]) if (!prev.has(v) && !(u === b.a && v === b.b)) { prev.set(v, u); queue.push(v); }
    }
    if (!prev.has(b.b)) continue;
    const cycle: number[] = [];
    for (let v = b.b; v !== -1; v = prev.get(v)!) cycle.push(v);
    found.set([...cycle].sort((x, y) => x - y).join(','), cycle);
  }
  return [...found.values()];
}

/** What is wrong with a molecule, in words: an expected formula or charge missed, an octet broken. */
export function moleculeErrors(m: Molecule, expect: {formula?: string; charge?: number} = {}): string[] {
  const out: string[] = [];
  if (expect.formula && hill(expect.formula) !== m.formula) out.push(`formula is ${m.formula}, not ${expect.formula}`);
  if (expect.charge !== undefined && expect.charge !== m.charge) out.push(`charge is ${m.charge}, not ${expect.charge}`);
  for (const [i, a] of m.atoms.entries()) {
    const shared = bondSum(m.bonds, i) + a.h, electrons = 2 * shared + 2 * a.pairs + a.radical;
    if (OCTET.has(a.el) && electrons > 8) out.push(`${a.el}${i + 1} holds ${electrons} electrons; a period-2 atom holds at most 8`);
    if (a.el === 'C' && shared + a.radical + Math.abs(a.charge) !== 4) out.push(`C${i + 1} makes ${shared} bonds (charge ${a.charge})`);
  }
  return out;
}

/** Element counts of a condensed formula: groups in brackets with their multiplier, bond marks ignored
 * ((CH3)3C-OH, CH2=CH2, [Co(NH3)6]Cl3, CuSO4·5H2O). */
function counts(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const [main, ...hydrates] = text.replace(/[-=≡–—]/g, '').split(/[·.*]/);
  const stack: Record<string, number>[] = [{}];
  for (const m of main.matchAll(/([A-Z][a-z]?)([0-9]*)|([([])|([)\]])([0-9]*)/g)) {
    const [el, open, close, k] = [m[1], m[3], m[4], m[2] || m[5]];
    if (open) stack.push({});
    else if (close) {
      const group = stack.pop()!, top = stack[stack.length - 1];
      for (const [e, n] of Object.entries(group)) top[e] = (top[e] ?? 0) + n * (k ? Number(k) : 1);
    } else if (el) stack[stack.length - 1][el] = (stack[stack.length - 1][el] ?? 0) + (k ? Number(k) : 1);
  }
  for (const [e, n] of Object.entries(stack[0])) out[e] = (out[e] ?? 0) + n;
  for (const h of hydrates) {
    const [, times, rest] = /^([0-9]*)(.*)$/.exec(h)!;
    for (const [e, n] of Object.entries(counts(rest))) out[e] = (out[e] ?? 0) + n * (times ? Number(times) : 1);
  }
  return out;
}

/** A formula as written (CH3CH2OH, C2H6O, SO4^2-, NH4+) in Hill order, so two spellings of one formula compare
 * equal. A charge of more than one is written after ^ (SO42- could be O42). */
export function hill(text: string): string {
  const [body, written] = text.includes('^') ? text.split('^') : [text.replace(/[+-]$/, ''), /[+-]$/.exec(text)?.[0] ?? ''];
  const charge = /^([0-9]*)([+-])$/.exec(written);
  const atoms: Atom[] = [];
  for (const [el, k] of Object.entries(counts(body)))
    for (let i = 0; i < k; i++) atoms.push({el, charge: 0, h: 0, pairs: 0, radical: 0, at: [0, 0]});
  const q = charge ? (charge[2] === '+' ? 1 : -1) * (charge[1] ? Number(charge[1]) : 1) : 0;
  return formula(atoms, q);
}

const METALS = new Set(['Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Cs', 'Ba', 'Pt', 'Au', 'Hg', 'Pb']);
/** IUPAC's element sequence for writing formulas (Red Book IR-4.4): the earlier element is written first. */
const SEQUENCE = ['Rn', 'Xe', 'Kr', 'Ar', 'Ne', 'He', 'B', 'Si', 'C', 'Sb', 'As', 'P', 'N', 'H', 'Te', 'Se', 'S', 'At', 'I',
  'Br', 'Cl', 'O', 'F'];

/** The formula as a schoolbook writes it. Organic molecules (a C–C or C–H bond) in Hill order, C2H6O. Others metals
 * first, then the IUPAC sequence (NH3, CO2, SO4 2-), with an acid's hydrogens in front (H2SO4, HNO3, NaHCO3) and
 * hydroxide groups last (NaOH, Ca(OH)2, OH-). The charge follows, as in `formula`. */
export function formulaText(m: Molecule): string {
  const hOn = (i: number) => m.atoms[i].h + m.bonds.filter(b => (b.a === i && m.atoms[b.b].el === 'H') || (b.b === i && m.atoms[b.a].el === 'H')).length;
  const others = (i: number) => m.bonds.filter(b => b.a === i || b.b === i).map(b => (b.a === i ? b.b : b.a)).filter(j => m.atoms[j].el !== 'H');
  const organic = m.atoms.some((a, i) => a.el === 'C' && (hOn(i) > 0 || others(i).some(j => m.atoms[j].el === 'C')));
  if (organic) return m.formula;
  const n: Record<string, number> = {};
  let hydroxide = 0, acidic = 0;
  for (const [i, a] of m.atoms.entries()) {
    if (a.el === 'H') continue;                      // counted on the atom it is bonded to
    const h = hOn(i), nb = others(i);
    if (a.el === 'O' && h === 1 && nb.every(j => METALS.has(m.atoms[j].el)) && (nb.length || m.atoms.some(x => METALS.has(x.el)) || a.charge < 0)) { hydroxide++; continue; }
    n[a.el] = (n[a.el] ?? 0) + 1;
    if (h) { if (a.el === 'O') acidic += h; else n.H = (n.H ?? 0) + h; }
  }
  if (!Object.keys(n).length && hydroxide === 0) n.H = m.atoms.length;   // H2
  const rank = (e: string) => (METALS.has(e) ? -1 : SEQUENCE.indexOf(e) < 0 ? SEQUENCE.length : SEQUENCE.indexOf(e));
  const order = Object.keys(n).sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
  const part = (e: string, k: number) => e + (k > 1 ? k : '');
  const metals = order.filter(e => METALS.has(e)), rest = order.filter(e => !METALS.has(e));
  let text = metals.map(e => part(e, n[e])).join('') + (acidic ? part('H', acidic) : '') + rest.map(e => part(e, n[e])).join('');
  if (hydroxide) text += hydroxide > 1 ? `(OH)${hydroxide}` : 'OH';
  const q = m.charge;
  return text + (q ? `${Math.abs(q) > 1 ? Math.abs(q) : ''}${q > 0 ? '+' : '-'}` : '');
}

/** A formula with subscript counts and a superscript charge: H2SO4 → H₂SO₄, SO42- (from formulaText) → SO₄²⁻. */
export function pretty(text: string, charge = 0): string {
  const SUB = '₀₁₂₃₄₅₆₇₈₉', SUP: Record<string, string> = {0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻'};
  // the charge is known, so its digits are told apart from the last count (SO42- is SO4 with 2-)
  const q = charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '-'}` : '';
  const body = q && text.endsWith(q) ? text.slice(0, -q.length) : text;
  return body.replace(/[0-9]/g, d => SUB[Number(d)]) + q.split('').map(c => SUP[c]).join('');
}
