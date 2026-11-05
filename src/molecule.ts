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
export const VALENCE: Record<string, number> = {H: 1, Li: 1, Na: 1, K: 1, Be: 2, Mg: 2, Ca: 2, B: 3, Al: 3,
  C: 4, Si: 4, N: 5, P: 5, O: 6, S: 6, F: 7, Cl: 7, Br: 7, I: 7, He: 2, Ne: 8, Ar: 8, Xe: 8};
/** Period-2 atoms never hold more than eight electrons. */
const OCTET = new Set(['B', 'C', 'N', 'O', 'F']);
const SYMBOLS = ['', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr',
  'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe'];

type RdJson = {molecules: {atoms: {z?: number; impHs?: number; chg?: number; nRad?: number}[];
  bonds: {bo?: number; atoms: [number, number]; stereo?: string}[];
  extensions?: {name: string; cipCodes?: [number, string][]}[]}[]};

/** A molecule from SMILES; `hydrogens` makes every H an atom of its own (full structural formulas). */
export function molecule(smiles: string, options: {hydrogens?: boolean} = {}): Molecule {
  const m = RD.get_mol(smiles);
  if (!m || !m.is_valid()) { m?.delete(); throw new Error(`not a molecule: ${smiles}`); }
  try {
    if (options.hydrogens) m.add_hs_in_place();
    m.set_new_coords(true);
    const canonical = RD.get_mol(smiles)!, can = canonical.get_smiles(); canonical.delete();
    const json = (JSON.parse(m.get_json()) as RdJson).molecules[0];
    const block = m.get_molblock().split('\n');
    const [na, nb] = [Number(block[3].slice(0, 3)), Number(block[3].slice(3, 6))];
    const tags = JSON.parse(m.get_stereo_tags()) as {CIP_atoms: [number, string][]; CIP_bonds: [number, number, string][]};
    const atoms: Atom[] = json.atoms.map((a, i) => {
      const line = block[4 + i];
      return {el: SYMBOLS[a.z ?? 6], charge: a.chg ?? 0, h: a.impHs ?? 0, pairs: 0, radical: a.nRad ?? 0,
        at: [Number(line.slice(0, 10)), Number(line.slice(10, 20))]};
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
    for (const [i, atom] of atoms.entries()) atom.pairs = lonePairs(atom, bondSum(bonds, i));
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

/** A formula as written (CH3CH2OH, C2H6O, SO4^2-, NH4+) in Hill order, so two spellings of one formula compare
 * equal. A charge of more than one is written after ^ (SO42- could be O42). */
export function hill(text: string): string {
  const [body, written] = text.includes('^') ? text.split('^') : [text.replace(/[+-]$/, ''), /[+-]$/.exec(text)?.[0] ?? ''];
  const charge = /^([0-9]*)([+-])$/.exec(written);
  const atoms: Atom[] = [];
  for (const [, el, k] of body.matchAll(/([A-Z][a-z]?)([0-9]*)/g))
    for (let i = 0; i < (k ? Number(k) : 1); i++) atoms.push({el, charge: 0, h: 0, pairs: 0, radical: 0, at: [0, 0]});
  const q = charge ? (charge[2] === '+' ? 1 : -1) * (charge[1] ? Number(charge[1]) : 1) : 0;
  return formula(atoms, q);
}
