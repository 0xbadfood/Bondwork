// Atom colours: the CPK/Jmol convention (oxygen red, nitrogen blue, sulfur yellow, chlorine green), lightened for a
// dark stage and deepened for a light one so each reads against its paper. Carbon and hydrogen take the ink colour.

/** On a dark stage. */
const DARK: Record<string, string> = {
  N: '#7fb2ff', O: '#ff7a6b', F: '#9fe2a0', Cl: '#7fd67f', Br: '#e0956a', I: '#c39bff', S: '#f2d35b', P: '#ffa64d',
  B: '#ffb5b5', Si: '#e6cfa0', Li: '#c58cff', Na: '#b38cff', K: '#a37cf0', Mg: '#a8e66a', Ca: '#8fe08f', Al: '#d8b0b0',
  Fe: '#f0965a', Cu: '#f0a868', Zn: '#a8b0e0', Co: '#f59ab0', Ni: '#7fe0a0', Cr: '#9fb0e8', Mn: '#c09ff0', Ag: '#d8d8d8',
  Pt: '#d8d8e8', Xe: '#7fd8e8', He: '#d8ffff', Ne: '#b8f0ff', Ar: '#90e0f0',
};
/** On a light stage. */
const LIGHT: Record<string, string> = {
  N: '#2a5fc7', O: '#d23a2a', F: '#2f8f45', Cl: '#2a8f2a', Br: '#9a4a1e', I: '#6b2fb0', S: '#a07d00', P: '#d0680a',
  B: '#c04a4a', Si: '#8a6a30', Li: '#7a3fc0', Na: '#6a3fc0', K: '#5a30b0', Mg: '#4a8a10', Ca: '#2f8a2f', Al: '#8a5050',
  Fe: '#b8501a', Cu: '#b06020', Zn: '#4a5590', Co: '#c03a60', Ni: '#1f8a50', Cr: '#3a5ab0', Mn: '#6a3fb0', Ag: '#707070',
  Pt: '#606078', Xe: '#1f8aa0', He: '#3a9aa0', Ne: '#2a8ab0', Ar: '#2a8aa0',
};

/** 'element': the CPK colours; 'mono': every atom in ink; or your own colours by element, over CPK
 * ({C: '#888', O: 'accent'}; Linkwork theme names such as accent and good work too). */
export type Colours = 'element' | 'mono' | Record<string, string>;

export function atomColour(el: string, colours: Colours = 'element', theme: 'dark' | 'light' = 'dark'): string {
  if (colours === 'mono') return 'ink';
  const own = typeof colours === 'object' ? colours[el] : undefined;
  return own ?? (theme === 'light' ? LIGHT : DARK)[el] ?? 'ink';
}
