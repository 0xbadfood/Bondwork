# Bondwork

Molecules and reaction mechanisms from plain data. Ask for `C4H8` with its geometric isomers, `butan-2-ol` with its
enantiomers, or HBr adding to propene, and Bondwork works out every atom, bond, charge and coordinate, checks them,
and moves the atoms from one step to the next. Nothing is drawn by hand and nothing is taken on trust from the caller.

Bondwork is the sibling of [Linkwork](https://github.com/0xbadfood/Linkwork): Linkwork moves links and joints,
Bondwork moves atoms and bonds. Its scenes use Linkwork's scene format, renderer and legibility checks.

## Plan

1. **Molecule core.** A molecular graph (atoms, bonds, lone pairs, charges), layout in 2D and 3D, and guards: atoms
   match the formula, every valence is right, formal charges add up. Drawn skeletal, condensed, full structural, or
   ball-and-stick; wedges, dashes, Newman, sawhorse, chair and Fischer projections.
2. **Named index.** Every molecule a course uses, with names, aliases, formula, SMILES, class and cached coordinates,
   each one passing the guards. A planner picks from the index; it never invents a structure.
3. **Isomers.** From a formula: chain, position, functional, metamerism and ring–chain isomers, deduplicated by
   canonical SMILES; geometric (cis/trans, E/Z) and optical isomers from stereo enumeration. Coordination compounds
   by placing ligands on their polyhedron and removing rotations: cis/trans, fac/mer, Δ/Λ.
4. **Mechanisms by rule.** A step is a set of curly arrows, and each arrow edits the graph: a lone pair becomes a bond,
   a bond becomes a lone pair, a π bond shifts. Electrons, charges and octets are checked after every step, and
   every atom keeps its number from reactants to products. Reaction templates apply to any substrate, and rules such
   as Markovnikov compare carbocation stability instead of looking the answer up.
5. **Motion.** Each step moves its atoms along a motion primitive (approach on the right trajectory, leave, proton
   hop, Walden inversion, ring closure, bond rotation), and each new structure is aligned to the last so that only
   the atoms that react move.

## Dependencies

MIT, Apache or BSD only: RDKit (BSD) for layout, canonical SMILES and stereo perception; OPSIN (MIT) to turn names
into structures, and to check that any name Bondwork shows turns back into the same molecule.

## Licence

MIT
