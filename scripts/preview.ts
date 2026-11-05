// Preview molecules as SVG through Linkwork (a sibling checkout, or LINKWORK=path): node scripts/preview.ts out/ 'SMILES|style|title' ...
import {mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {formulaText, molecule, moleculeScene, pretty} from '../src/index.ts';

const lw = await import(resolve(process.env.LINKWORK ?? join(import.meta.dirname, '../../linkwork'), 'src/index.ts'));
const [out, ...items] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
for (const [n, item] of items.entries()) {
  const [smiles, style = 'skeletal', title = smiles, extra = ''] = item.split('|');
  const m = molecule(smiles, {hydrogens: extra.includes('H')});
  const scene = moleculeScene(m, {style: style as 'skeletal', title: `${title}  ${pretty(formulaText(m), m.charge)}`, pairs: extra.includes('P'), labels: extra.includes('L'), theme: extra.includes('W') ? 'light' : 'dark', colours: extra.includes('M') ? 'mono' : 'element'});
  const problems = lw.check(scene);
  if (problems.length) console.log(n, title, problems.slice(0, 3));
  writeFileSync(join(out, `${n}.svg`), lw.svg(scene, 2.9));
}
