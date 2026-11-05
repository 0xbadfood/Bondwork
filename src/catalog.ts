// The named index: every molecule a course uses, under the names and formula spelling its books use, each entry
// checked against its own structure before it is admitted.
import {hill, molecule, moleculeErrors, type Molecule} from './molecule.ts';

export type Source = {book: string; blocks: string[]; pages: number[]};
export type Entry = {
  id: string; name: string; aliases: string[]; iupac: string;
  /** The formula as the book prints it (CH3COOH, SO4^2-); empty when it prints none. */
  formula: string;
  smiles: string; kind: 'molecule' | 'ion' | 'radical' | 'intermediate' | 'complex' | 'ionic'; sources: Source[];
};

/** A name as an id: (2E)-but-2-ene → 2e-but-2-ene, acetic acid → acetic-acid. */
export const slug = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const STEREO_WORDS = /\b(cis|trans)\b|\((?:[0-9]+[EZRS],?\s*)*[0-9]*[EZRS]\)|\b[dl]-|\(\+\)|\(−\)|\(-\)|\bmeso\b/i;

/** What is wrong with an entry, in words. `opsin` is the SMILES OPSIN read from the IUPAC name (null: OPSIN could not
 * read it; undefined: OPSIN was not run). */
export function entryErrors(e: Entry, opsin?: string | null): string[] {
  let m: Molecule;
  try { m = molecule(e.smiles); } catch { return [`SMILES ${e.smiles} is not a molecule`]; }
  const out: string[] = [];
  const book = e.formula ? hill(e.formula) : undefined;
  out.push(...moleculeErrors(m, book ? {formula: book} : {}).map(x => x.replace(/formula is (\S+), not \S+/, `the structure is $1 but the book prints ${e.formula}`)));
  const stereo = m.atoms.some(a => a.cip) || m.bonds.some(b => b.cip);
  const named = [e.iupac, e.name].some(n => STEREO_WORDS.test(n));
  if (named && !stereo) out.push(`the name says which stereoisomer (${e.iupac || e.name}) but the SMILES leaves it open`);
  if (opsin === null) out.push(`OPSIN cannot read the IUPAC name "${e.iupac}"`);
  else if (opsin !== undefined) {
    let theirs: string | undefined;
    try { theirs = molecule(opsin).smiles; } catch { theirs = undefined; }
    if (theirs !== m.smiles) out.push(`the IUPAC name "${e.iupac}" is ${theirs ?? opsin}, not this structure (${m.smiles})`);
  }
  return out;
}

/** Entries merged by structure: one per canonical SMILES, with every name and every source. */
export function mergeEntries(entries: Entry[]): Entry[] {
  const by = new Map<string, Entry>();
  for (const e of entries) {
    const key = molecule(e.smiles).smiles, old = by.get(key);
    if (!old) { by.set(key, {...e, smiles: key, aliases: [...new Set(e.aliases)].filter(a => a !== e.name)}); continue; }
    old.aliases = [...new Set([...old.aliases, ...e.aliases, e.name])].filter(a => a !== old.name).sort();
    old.formula ||= e.formula;
    old.iupac ||= e.iupac;
    for (const s of e.sources) {
      const same = old.sources.find(x => x.book === s.book);
      if (same) { same.blocks = [...new Set([...same.blocks, ...s.blocks])]; same.pages = [...new Set([...same.pages, ...s.pages])].sort((a, b) => a - b); }
      else old.sources.push(s);
    }
  }
  // ids are unique: a second entry whose name slugs the same takes its formula as a suffix
  const seen = new Set<string>();
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name)).map(e => {
    let id = slug(e.name);
    if (seen.has(id)) id = `${id}-${slug(hill(e.formula || molecule(e.smiles).formula))}`;
    seen.add(id);
    return {...e, id};
  });
}

/** Find an entry by any of its names (case and spacing ignored), its id, or its SMILES. */
export function lookup(index: Entry[], query: string): Entry | undefined {
  const q = slug(query);
  return index.find(e => e.id === q || slug(e.name) === q || e.aliases.some(a => slug(a) === q) || slug(e.iupac) === q)
    ?? (() => { try { const s = molecule(query).smiles; return index.find(e => e.smiles === s); } catch { return undefined; } })();
}
