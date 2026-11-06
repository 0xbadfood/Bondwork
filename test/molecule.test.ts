// The molecule core: structures read from SMILES, with formula, charge, lone pairs and stereo worked out and checked.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {hill, molecule, moleculeErrors, moleculeProps, moleculeScene} from '../src/index.ts';

test('formulas in Hill order, with the charge', () => {
  assert.equal(molecule('CCO').formula, 'C2H6O');
  assert.equal(molecule('CC(=O)[O-]').formula, 'C2H3O2-');
  assert.equal(molecule('c1ccccc1').formula, 'C6H6');
  assert.equal(molecule('[NH4+]').formula, 'H4N+');
  assert.equal(molecule('CCO', {hydrogens: true}).formula, 'C2H6O');
  assert.equal(hill('CH3CH2OH'), 'C2H6O');
  assert.equal(hill('SO4^2-'), 'O4S2-');
  assert.equal(hill('NH4+'), 'H4N+');
  // every element, not only the light ones (2026-11-05: Ba, Pb and Hg read as undefined)
  assert.equal(molecule('[Ba+2].[O-]S(=O)(=O)[O-]').formula, 'BaO4S');
  assert.equal(molecule('[Pb+2].[S-2]').formula, 'PbS');
  assert.equal(molecule('[Hg+2]').formula, 'Hg2+');
  assert.equal(molecule('[U]').formula, 'U');
  // a lone atom has a place (2026-11-05: CoordGen put H+ at NaN and the contact sheet would not draw)
  for (const s of ['[H+]', '[Cl-]', '[Na+].[Cl-]', 'C', '[Hg+2]']) assert.ok(molecule(s).atoms.every(a => a.at.every(Number.isFinite)), s);
});

test('lone pairs from the valence electrons left over', () => {
  const pairs = (s: string, el: string) => molecule(s).atoms.find(a => a.el === el)!.pairs;
  assert.equal(pairs('CCO', 'O'), 2);
  assert.equal(pairs('C#N', 'N'), 1);
  assert.equal(pairs('N', 'N'), 1);
  assert.equal(pairs('[NH4+]', 'N'), 0);
  assert.equal(pairs('O', 'O'), 2);
  assert.deepEqual(molecule('CC(=O)[O-]').atoms.filter(a => a.el === 'O').map(a => a.pairs).sort(), [2, 3]);
});

test('stereo: E/Z on double bonds, R/S at centres, wedges drawn from the centre', () => {
  assert.equal(molecule('C/C=C\\C').bonds.find(b => b.order === 2)!.cip, 'Z');
  assert.equal(molecule('C/C=C/C').bonds.find(b => b.order === 2)!.cip, 'E');
  assert.equal(molecule('C[C@H](O)CC').atoms.find(a => a.cip)!.cip, 'S');
  assert.equal(molecule('N[C@@H](C)C(=O)O').atoms.find(a => a.cip)!.cip, 'S');   // L-alanine is S
  const m = molecule('C[C@H](O)CC'), w = m.bonds.find(b => b.stereo)!;
  assert.ok(m.atoms[w.a].cip, 'the narrow end of a wedge is the stereo centre');
  assert.equal(molecule('CC=CC').bonds.find(b => b.order === 2)!.cip, undefined);
});

test('the same molecule written two ways has one canonical SMILES', () => {
  assert.equal(molecule('OCC').smiles, molecule('C(O)C').smiles);
  assert.notEqual(molecule('CCCC').smiles, molecule('CC(C)C').smiles);
});

test('guards: a wrong formula or charge is named; a bad SMILES is refused', () => {
  assert.deepEqual(moleculeErrors(molecule('CCO'), {formula: 'C2H5OH'}), []);
  assert.match(moleculeErrors(molecule('CCO'), {formula: 'C2H4O'})[0], /formula is C2H6O/);
  assert.match(moleculeErrors(molecule('CC(=O)[O-]'), {charge: 0})[0], /charge is -1/);
  assert.deepEqual(moleculeErrors(molecule('[CH3+]')), []);
  assert.throws(() => molecule('C(C'), /not a molecule/);
  assert.throws(() => molecule('C(C)(C)(C)(C)C'), /not a molecule/);   // five bonds on carbon
});

test('noble-gas compounds the book names are molecules; other valence errors still are not', () => {
  // 2026-11-06, Chemical Bonding: RDKit's valence table has no bonds for krypton, so KrF2 failed to parse
  const kr = molecule('F[Kr]F');
  assert.equal(kr.formula, 'F2Kr');
  assert.equal(kr.atoms.find(a => a.el === 'Kr')!.pairs, 3);
  assert.deepEqual(moleculeErrors(kr, {formula: 'KrF2'}), []);
  assert.equal(molecule('F[Xe](F)(F)F').atoms.find(a => a.el === 'Xe')!.pairs, 2);
});

test('expanded octets by electron count: ClF3, BrF5, IF7 and the ClO2 radical; carbon and overfull atoms refused', () => {
  // 2026-11-06, Chemical Bonding: RDKit's valence table refuses the interhalogens the book draws
  const at = (s: string, el: string) => molecule(s).atoms.find(a => a.el === el)!;
  assert.equal(molecule('FCl(F)F').formula, 'ClF3');
  assert.equal(at('FCl(F)F', 'Cl').pairs, 2);
  assert.equal(at('FBr(F)(F)(F)F', 'Br').pairs, 1);
  assert.equal(at('F[I](F)(F)(F)(F)(F)F', 'I').pairs, 0);
  assert.deepEqual([at('O=[Cl]=O', 'Cl').radical, at('O=[Cl]=O', 'Cl').pairs], [1, 1]);
  assert.throws(() => molecule('F[Cl](F)(F)(F)(F)(F)(F)F'), /not a molecule/);   // eight bonds, seven electrons
  assert.throws(() => molecule('FCl(F)FC(C)(C)(C)C'), /not a molecule/);          // the carbon is still RDKit's
  assert.throws(() => molecule('[Ne][Ne]'), /not a molecule/);                    // period 2: no expanded octet
});

test('deuterium and tritium are D and T, as books write them', () => {
  // 2026-11-06, Hydrogen: D2, HD and ND3 read as H2 and NH3
  assert.equal(molecule('[2H][2H]').formula, 'D2');
  assert.equal(molecule('[2H]N([2H])[2H]').formula, 'D3N');
  assert.deepEqual(moleculeErrors(molecule('[2H]N([2H])[2H]'), {formula: 'ND3'}), []);
  assert.deepEqual(moleculeErrors(molecule('[2H]O[2H]'), {formula: 'D2O'}), []);
  assert.equal(molecule('[3H][H]').formula, 'HT');
});

test('benzene, skeletal: six corners, three inner second lines, no symbols', () => {
  const props = moleculeProps(molecule('c1ccccc1'), {style: 'skeletal'});
  assert.equal(props.filter(p => p.type === 'line' && !String(p.id).endsWith('-2')).length, 6);
  assert.equal(props.filter(p => String(p.id).endsWith('-2')).length, 3);
  assert.equal(props.filter(p => p.type === 'text').length, 0);
});

test('a structural formula writes every atom; hydrogens go on the free side', () => {
  const props = moleculeProps(molecule('CCO'), {style: 'structural'});
  assert.equal(props.filter(p => p.type === 'text' && !String(p.id).includes('-h')).length, 3);
  assert.deepEqual(props.filter(p => String(p.id).endsWith('-h')).map(p => p.text).sort(), ['H', 'H₂', 'H₃']);
});

// Linkwork checks the drawn scenes when it sits beside this repo (or LINKWORK points to it)
const LW = process.env.LINKWORK ?? join(import.meta.dirname, '../../linkwork');
test('drawn scenes pass Linkwork\'s checks: nothing off stage, no text on text', {skip: !existsSync(join(LW, 'src/index.ts'))}, async () => {
  const lw = await import(join(LW, 'src/index.ts'));
  for (const [s, style, extra] of [['C/C=C\\C', 'skeletal', ''], ['N[C@@H](C)C(=O)O', 'skeletal', 'L'], ['CCO', 'structural', 'HP'],
    ['CC(=O)[O-]', 'structural', 'P'], ['C#N', 'structural', 'P'], ['c1ccccc1O', 'skeletal', ''], ['ClC(Cl)(Cl)Cl', 'structural', 'P']] as const) {
    const scene = moleculeScene(molecule(s, {hydrogens: extra.includes('H')}), {style, pairs: extra.includes('P'), labels: extra.includes('L'), title: s});
    assert.deepEqual(lw.check(scene), [], s);
  }
});

test('atom colours: CPK by element, each bond half and half, mono and own colours on request', async () => {
  const {atomColour} = await import('../src/index.ts');
  assert.equal(atomColour('O'), '#ff7a6b');
  assert.equal(atomColour('O', 'element', 'light'), '#d23a2a');
  assert.equal(atomColour('C'), 'ink');
  assert.equal(atomColour('O', 'mono'), 'ink');
  assert.equal(atomColour('O', {O: 'accent'}), 'accent');
  assert.equal(atomColour('N', {O: 'accent'}), '#7fb2ff');
  const props = moleculeProps(molecule('CO'), {style: 'skeletal'});
  const halves = props.filter(p => p.type === 'line').map(p => (p.style as {stroke: string}).stroke);
  assert.deepEqual(halves, ['ink', '#ff7a6b'], 'C–O: the carbon half in ink, the oxygen half red');
  assert.equal(props.find(p => p.text === 'O')!.style!.fill, '#ff7a6b');
  const mono = moleculeProps(molecule('CO'), {colours: 'mono'});
  assert.equal(mono.filter(p => p.type === 'line').length, 1);
  const lit = moleculeProps(molecule('CCO'), {highlight: {1: 'accent'}});
  assert.ok(lit.some(p => p.type === 'line' && (p.style as {stroke: string}).stroke === 'accent'));
});

test('a symbol sits centred on its atom (Linkwork centres text on y)', () => {
  const m = molecule('CO'), props = moleculeProps(m, {style: 'structural'});
  const [c, o] = ['C', 'O'].map(s => props.find(p => p.text === s)!);
  const bond = props.find(p => p.type === 'line')!;
  // the bond runs along the line between the two symbols' centres
  const cross = ((bond.x2 as number) - (bond.x1 as number)) * ((o.y as number) - (c.y as number)) - ((bond.y2 as number) - (bond.y1 as number)) * ((o.x as number) - (c.x as number));
  assert.ok(Math.abs(cross) < 1e-6 * 1e4, String(cross));
});

test('formulas as a schoolbook writes them: acids H first, hydroxides last, organics in Hill order', async () => {
  const {formulaText, pretty} = await import('../src/index.ts');
  const cases: [string, string][] = [['OS(=O)(=O)O', 'H2SO4'], ['O[N+](=O)[O-]', 'HNO3'], ['N', 'NH3'], ['[NH4+]', 'NH4+'],
    ['O', 'H2O'], ['[Na+].[Cl-]', 'NaCl'], ['[Ca+2].[O-]C([O-])=O', 'CaCO3'], ['O=C=O', 'CO2'], ['[Na+].[OH-]', 'NaOH'],
    ['[Ca+2].[OH-].[OH-]', 'Ca(OH)2'], ['[OH-]', 'OH-'], ['OP(O)(O)=O', 'H3PO4'], ['[O-]S(=O)(=O)[O-]', 'SO42-'], ['Cl', 'HCl'],
    ['[Na+].OC([O-])=O', 'NaHCO3'], ['C', 'CH4'], ['CCO', 'C2H6O'], ['[H][H]', 'H2'], ['OO', 'H2O2'], ['[NH4+].[Cl-]', 'NH4Cl']];
  for (const [s, want] of cases) assert.equal(formulaText(molecule(s)), want, s);
  assert.equal(pretty('H2SO4'), 'H₂SO₄');
  assert.equal(pretty('SO42-', -2), 'SO₄²⁻');
  assert.equal(pretty('NH4+', 1), 'NH₄⁺');
});

test('condensed formulas as books print them', () => {
  assert.equal(hill('(CH3)3C-OH'), 'C4H10O');
  assert.equal(hill('CH2=CH2'), 'C2H4');
  assert.equal(hill('CH3COOH'), 'C2H4O2');
  assert.equal(hill('[Co(NH3)6]Cl3'), 'Cl3CoH18N6');
  assert.equal(hill('CuSO4·5H2O'), 'CuH10O9S');
  assert.equal(hill('CH≡CH'), 'C2H2');
});

test('skeletal formulas write the carbons a corner cannot show; radicals show their dot; charges keep off bonds', () => {
  const texts = (s: string) => moleculeProps(molecule(s)).filter(p => p.type === 'text').map(p => p.text);
  assert.ok(texts('O=C=O').includes('C'), 'O=C=O, not a long O=O');
  assert.deepEqual(texts('CBr').sort(), ['Br', 'C', 'H₃']);
  assert.ok(texts('C=C=CC').includes('C'), 'the middle carbon of an allene');
  assert.ok(!texts('CCCC').includes('C'), 'a chain stays corners');
  assert.equal(moleculeProps(molecule('[Cl]')).filter(p => p.type === 'circle').length, 1, 'Cl• has its dot');
  assert.equal(moleculeProps(molecule('[Cu+2].[O-2]')).filter(p => p.type === 'circle').length, 0, 'Cu2+ has no dot');
  // carbon monoxide: C≡O with C− and O+; neither charge sits on the bond's line
  const props = moleculeProps(molecule('[C-]#[O+]'), {style: 'skeletal'});
  const bond = props.find(p => p.type === 'line')!, y = bond.y1 as number;
  for (const q of props.filter(p => String(p.id).endsWith('-q'))) assert.ok(Math.abs((q.y as number) - y) > 10, `${q.text} sits on the bond`);
  // acetate's O−: the sign goes high, not low on the right where it reads as O_
  const acetate = moleculeProps(molecule('CC(=O)[O-]')), o = acetate.find(p => p.text === 'O' && acetate.some(q => q.id === `${p.id}-q`))!;
  assert.ok((acetate.find(q => q.id === `${o.id}-q`)!.y as number) < (o.y as number), 'charge above the middle of the symbol');
});
