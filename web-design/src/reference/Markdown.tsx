// OpenAPI description-ları üçün kiçik, təhlükəsiz Markdown renderer (HTML yox — yalnız React elementləri):
// başlıqlar (###), paraqraf, cədvəl, ``` kod bloku, - siyahı, **qalın**, `kod`, [link](url).
import { Fragment, type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{inline(m[2], key)}</strong>);
    else if (m[3] !== undefined) out.push(<code key={key}>{m[3]}</code>);
    else out.push(<a href={m[5]} key={key} rel="noreferrer" target="_blank">{m[4]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      blocks.push(<pre className="md-code" tabIndex={0} key={key}><code>{code.join("\n")}</code></pre>);
    } else if (/^#{1,4} /.test(line)) {
      blocks.push(<h4 className="md-heading" key={key}>{inline(line.replace(/^#+ /, ""), key)}</h4>);
      i++;
    } else if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(lines[i]);
      const [head, , ...body] = rows;
      blocks.push(
        <div className="md-table-wrap" key={key} tabIndex={0}>
          <table className="md-table">
            <thead><tr>{cells(head).map((c, j) => <th key={j}>{inline(c, `${key}h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^\s*[*-] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && (/^\s*[*-] /.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length)); i++) {
        if (/^\s*[*-] /.test(lines[i])) items.push(lines[i].replace(/^\s*[*-] /, ""));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
      }
      blocks.push(<ul className="md-list" key={key}>{items.map((it, j) => <li key={j}>{inline(it, `${key}l${j}`)}</li>)}</ul>);
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() && !/^(```|#{1,4} |\s*\||\s*[*-] )/.test(lines[i]); i++) para.push(lines[i].trim());
      blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
    }
  }
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

// JSON-u rəngli göstərmək üçün (React span-ları — innerHTML yoxdur)
export function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? "";
  const parts: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(<span className={m[2] ? "json-key" : "json-string"} key={k++}>{m[1]}</span>);
      if (m[2]) parts.push(m[2]);
    } else if (m[3] !== undefined) parts.push(<span className="json-literal" key={k++}>{m[3]}</span>);
    else parts.push(<span className="json-number" key={k++}>{m[4]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <code>{parts}</code>;
}
