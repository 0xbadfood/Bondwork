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
