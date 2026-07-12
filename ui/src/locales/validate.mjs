const PLACEHOLDER_PATTERN = /{{\s*([\w.-]+)\s*}}/g;

function placeholders(value) {
  const found = new Set();
  for (const match of String(value).matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

export function assertLocaleParity(catalogs) {
  const entries = Object.entries(catalogs);
  if (entries.length < 2) {
    return catalogs;
  }

  const [referenceName, reference] = entries[0];
  const referenceKeys = Object.keys(reference).sort();
  const problems = [];
  for (const [localeName, catalog] of entries.slice(1)) {
    const localeKeys = Object.keys(catalog).sort();
    const missing = referenceKeys.filter((key) => !(key in catalog));
    const extra = localeKeys.filter((key) => !(key in reference));
    if (missing.length) {
      problems.push(`${localeName} missing: ${missing.join(', ')}`);
    }
    if (extra.length) {
      problems.push(`${localeName} extra: ${extra.join(', ')}`);
    }
    for (const key of referenceKeys.filter((candidate) => candidate in catalog)) {
      const expected = placeholders(reference[key]);
      const actual = placeholders(catalog[key]);
      if (expected.join('|') !== actual.join('|')) {
        problems.push(`${localeName} placeholders for ${key}: expected [${expected}], got [${actual}]`);
      }
    }
  }

  if (problems.length) {
    throw new Error(`Locale parity failed against ${referenceName}:\n${problems.join('\n')}`);
  }
  return catalogs;
}
