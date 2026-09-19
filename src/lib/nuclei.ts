const ELEMENTS: Record<string, string> = {
  Hydrogen: 'H',
  Deuterium: 'H',
  Tritium: 'H',
  Lithium: 'Li',
  Boron: 'B',
  Carbon: 'C',
  Nitrogen: 'N',
  Oxygen: 'O',
  Fluorine: 'F',
  Sodium: 'Na',
  Aluminum: 'Al',
  Aluminium: 'Al',
  Silicon: 'Si',
  Phosphorus: 'P',
  Vanadium: 'V',
  Cobalt: 'Co',
  Selenium: 'Se',
  Yttrium: 'Y',
  Rhodium: 'Rh',
  Cadmium: 'Cd',
  Tin: 'Sn',
  Tellurium: 'Te',
  Xenon: 'Xe',
  Tungsten: 'W',
  Platinum: 'Pt',
  Mercury: 'Hg',
  Lead: 'Pb',
};

/** Delta の軸名 ("Proton", "Carbon13", "Phosphorus31" など) を "1H", "13C" の形にする */
export function normalizeNucleus(axisName: string): string {
  const name = axisName.trim();
  if (/^proton$/i.test(name)) return '1H';
  if (/^deuterium$/i.test(name)) return '2H';
  const m = /^([A-Za-z]+?)(\d+)$/.exec(name);
  if (m) {
    const word = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return `${m[2]}${ELEMENTS[word] ?? word}`;
  }
  return name;
}

/** "13C" → "^{13}C" */
export function nucleusRich(nucleus: string): string {
  const m = /^(\d+)(\D+)$/.exec(nucleus);
  return m ? `^{${m[1]}}${m[2]}` : nucleus;
}

/** 核種ごとの既定値 */
export function nucleusDefaults(nucleus: string) {
  switch (nucleus) {
    case '1H':
      return { decimals: 3, tolerance: 0.03, snapPpm: 0.05 };
    case '13C':
      return { decimals: 2, tolerance: 0.3, snapPpm: 0.5 };
    default:
      return { decimals: 2, tolerance: 0.5, snapPpm: 0.5 };
  }
}
