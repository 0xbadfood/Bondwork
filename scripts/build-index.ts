// Build index/molecules.json from chapter candidates (molecules.json files, one per chapter): every candidate is
// checked (Bondwork's guards; OPSIN reading its IUPAC name when vendor/opsin-cli-*.jar is present) and either
// admitted or listed in index/rejected.json with what is wrong. Entries already in the index are kept.
//   node scripts/build-index.ts ~/manim/textbook-digest/kech2-02/molecules.json ...
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {entryErrors, mergeEntries, type Entry} from '../src/catalog.ts';

const ROOT = join(import.meta.dirname, '..'), INDEX = join(ROOT, 'index');
type Candidate = {name: string; aliases?: string[]; iupac?: string; formula?: string; smiles: string; kind: Entry['kind']; blocks: string[]; pages: number[]};

/** SMILES for each name from OPSIN (MIT, Java), or null for a name it cannot read; undefined when OPSIN is absent. */
function opsin(names: string[]): (string | null)[] | undefined {
  const dir = join(ROOT, 'vendor'), jar = existsSync(dir) ? readdirSync(dir).find(f => /^opsin-cli-.*\.jar$/.test(f)) : undefined;
  if (!jar || !names.length) return undefined;
  const out = execFileSync('java', ['-jar', join(dir, jar), '-osmi'], {input: names.join('\n') + '\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']});
  const lines = out.split('\n');
  return names.map((_, i) => lines[i]?.trim() || null);
}

const files = process.argv.slice(2);
mkdirSync(INDEX, {recursive: true});
const old: Entry[] = existsSync(join(INDEX, 'molecules.json')) ? JSON.parse(readFileSync(join(INDEX, 'molecules.json'), 'utf8')) : [];
const rejectedPath = join(INDEX, 'rejected.json');
const rejected: Record<string, {name: string; smiles: string; problems: string[]}[]> = existsSync(rejectedPath) ? JSON.parse(readFileSync(rejectedPath, 'utf8')) : {};
const admitted: Entry[] = [], rebuilt = new Set<string>();
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8')), book = data.chapter ?? basename(dirname(file));
  const entries: Entry[] = (data.molecules as Candidate[]).map(c => ({id: '', name: c.name, aliases: c.aliases ?? [], iupac: c.iupac ?? '',
    formula: c.formula ?? '', smiles: c.smiles, kind: c.kind, sources: [{book, blocks: c.blocks, pages: c.pages ?? []}]}));
  const read = opsin(entries.map(e => e.iupac || e.name));
  rejected[book] = [];
  rebuilt.add(book);
  entries.forEach((e, i) => {
    const problems = entryErrors(e, read?.[i]);
    if (problems.length) rejected[book].push({name: e.name, smiles: e.smiles, problems});
    else admitted.push(e);
  });
  console.log(`${book}: ${entries.length - rejected[book].length} admitted, ${rejected[book].length} rejected${read ? '' : ' (OPSIN not run: no vendor/opsin-cli jar)'}`);
}
// a rebuilt chapter replaces what it gave before, so an entry a stricter guard now refuses leaves the index
const kept = old.map(e => ({...e, sources: e.sources.filter(s => !rebuilt.has(s.book))})).filter(e => e.sources.length);
const index = mergeEntries([...kept, ...admitted]);
writeFileSync(join(INDEX, 'molecules.json'), JSON.stringify(index, null, 1) + '\n');
writeFileSync(rejectedPath, JSON.stringify(rejected, null, 1) + '\n');
console.log(`index: ${index.length} entries`);
