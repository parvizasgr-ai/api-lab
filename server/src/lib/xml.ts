// Minimal JSON → XML çevirici (JSON vs XML dərsi üçün). Massivlərin elementləri `itemName` adlanır.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

function node(name: string, value: unknown, itemName: string): string {
  if (value === null || value === undefined) return `<${name}/>`;
  if (Array.isArray(value)) return `<${name}>${value.map((v) => node(itemName, v, itemName)).join('')}</${name}>`;
  if (typeof value === 'object') {
    return `<${name}>${Object.entries(value).map(([k, v]) => node(k, v, itemName)).join('')}</${name}>`;
  }
  return `<${name}>${esc(String(value))}</${name}>`;
}

export function toXml(root: string, value: unknown, itemName = 'item'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${node(root, value, itemName)}`;
}
