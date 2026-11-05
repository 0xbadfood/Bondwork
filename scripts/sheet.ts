// A contact sheet of index entries: every molecule of a chapter drawn in a grid with its name and book formula, as
// one SVG through Linkwork (a sibling checkout, or LINKWORK=path). node scripts/sheet.ts kech2-03 out.svg [light]
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import type {Entry} from '../src/catalog.ts';
import {formulaText, molecule, moleculeProps, pretty} from '../src/index.ts';

const lw = await import(resolve(process.env.LINKWORK ?? join(import.meta.dirname, '../../linkwork'), 'src/index.ts'));
const [book, out, theme = 'dark'] = process.argv.slice(2);
const index: Entry[] = JSON.parse(readFileSync(join(import.meta.dirname, '../index/molecules.json'), 'utf8'));
const entries = index.filter(e => e.sources.some(s => s.book === book));
const cols = 6, w = 420, h = 360, rows = Math.ceil(entries.length / cols);
const props: object[] = [];
entries.forEach((e, n) => {
  const [x, y] = [(n % cols) * w, Math.floor(n / cols) * h], m = molecule(e.smiles);
  props.push(...moleculeProps(m, {box: [x, y + 20, w, h - 90], id: `e${n}`, bond: 60, theme: theme as 'dark', labels: true}));
  const f = e.formula ? e.formula.replace(/\^/, '') : formulaText(m);
  props.push({id: `e${n}-name`, type: 'text', x: x + w / 2, y: y + h - 52, text: e.name, size: 22, align: 'middle', weight: 600, width: w - 30},
    {id: `e${n}-f`, type: 'text', x: x + w / 2, y: y + h - 22, text: pretty(f, m.charge), size: 20, align: 'middle', style: {fill: 'muted'}});
});
const scene = {linkwork: 1, width: cols * w, height: Math.max(1, rows) * h, fps: 30, duration: 1, theme, props, actors: []};
writeFileSync(out, lw.svg(scene, 0.99));
console.log(`${entries.length} molecules -> ${out}`);
