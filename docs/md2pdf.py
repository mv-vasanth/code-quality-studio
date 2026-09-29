#!/usr/bin/env python3
"""Minimal markdown -> styled HTML for the docs we actually write.

Deliberately small: handles the subset used in these guides (headings, fenced
code, tables, lists, blockquotes, inline code/bold/links, hr) rather than
pulling in a dependency. Anything it does not know is passed through escaped.
"""
import html, re, sys

def inline(t):
    t = html.escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*([^*\n]+)\*(?!\*)', r'<em>\1</em>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    return t

def convert(md):
    out, i, lines = [], 0, md.split("\n")
    while i < len(lines):
        ln = lines[i]

        if ln.startswith("```"):                      # fenced code
            i += 1; buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            out.append("<pre><code>" + html.escape("\n".join(buf)) + "</code></pre>")
            continue

        if re.match(r'^\|.*\|\s*$', ln) and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|\s*$', lines[i+1]):
            hdr = [c.strip() for c in ln.strip().strip("|").split("|")]
            i += 2; rows = []
            while i < len(lines) and re.match(r'^\|.*\|\s*$', lines[i]):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            out.append("<table><tr>" + "".join(f"<th>{inline(c)}</th>" for c in hdr) + "</tr>" +
                       "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows) +
                       "</table>")
            continue

        if ln.startswith("> "):                        # blockquote -> callout
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip(">").strip()); i += 1
            out.append('<div class="note">' + inline(" ".join(buf)) + "</div>")
            continue

        m = re.match(r'^(#{1,4})\s+(.*)', ln)
        if m:
            lvl = len(m.group(1))
            cls = ' class="chapter"' if lvl == 2 else ""
            out.append(f"<h{lvl}{cls}>{inline(m.group(2))}</h{lvl}>")
            i += 1; continue

        if re.match(r'^\s*[-*]\s+', ln) or re.match(r'^\s*\d+\.\s+', ln):
            ordered = bool(re.match(r'^\s*\d+\.\s+', ln)); items = []
            while i < len(lines) and (re.match(r'^\s*[-*]\s+', lines[i]) or re.match(r'^\s*\d+\.\s+', lines[i])):
                items.append(re.sub(r'^\s*(?:[-*]|\d+\.)\s+', '', lines[i])); i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue

        if re.match(r'^-{3,}\s*$', ln):
            out.append("<hr/>"); i += 1; continue

        if ln.strip() == "":
            i += 1; continue

        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,4}\s|```|\||>|\s*[-*]\s|\s*\d+\.\s|-{3,})', lines[i]):
            buf.append(lines[i]); i += 1
        out.append("<p>" + inline(" ".join(buf)) + "</p>")
    return "\n".join(out)

if __name__ == "__main__":
    md_path, css_path, out_path, title = sys.argv[1:5]
    body = convert(open(md_path, encoding="utf8").read())
    css = open(css_path, encoding="utf8").read()
    open(out_path, "w", encoding="utf8").write(css + body + "\n</body></html>")
    print("wrote", out_path)
