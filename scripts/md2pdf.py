#!/usr/bin/env python3
"""
md2pdf.py — Markdown -> PDF with ZERO dependencies (Python stdlib only).

Why it exists: at a hackathon you cannot rely on LaTeX, Chrome, a package
install or even WiFi. This renders a judge-ready PDF from plain Markdown
using the PDF base-14 fonts, so it works on any machine, offline, always.

Usage:
    python3 md2pdf.py INPUT.md [OUTPUT.pdf] [--title "Doc title"]

Supports: # ## ### headings, paragraphs, **bold**, *italic*, `code`,
[links](url), - and 1. lists, - [ ] checkboxes, > blockquotes,
``` fenced code ```, | GFM tables |, --- rules.
"""
import re
import sys
import zlib

# ---------------------------------------------------------------- page geometry
PW, PH = 612.0, 792.0          # US Letter, points
ML, MR, MT, MB = 54.0, 54.0, 58.0, 56.0
CW = PW - ML - MR              # content width = 504

BODY, LEAD = 10.0, 14.6
H1, H2, H3 = 21.0, 14.0, 11.0
CODE_FS, CODE_LEAD = 8.3, 11.6
TBL_FS, TBL_LEAD = 8.6, 11.4

INK = (0.082, 0.090, 0.102)
MUTED = (0.357, 0.384, 0.412)
ACCENT = (0.114, 0.306, 0.847)
RULE = (0.886, 0.898, 0.914)
SOFT = (0.964, 0.969, 0.976)
QUOTE_BG = (0.933, 0.953, 1.0)
HEAD_BG = INK
ZEBRA = (0.980, 0.984, 0.988)

FREG, FBLD, FITL, FMON, FMONB = "F1", "F2", "F3", "F4", "F5"

# ------------------------------------------------------------- font metrics
_HELV = (
    "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 "
    "556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 "
    "1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 "
    "667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 "
    "333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 "
    "556 556 333 500 278 556 500 722 500 500 500 334 260 334 584"
)
_HELB = (
    "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 "
    "556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 "
    "975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 "
    "667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 "
    "333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 "
    "611 611 389 556 333 611 556 778 556 556 500 389 280 389 584"
)
_W_REG = [int(x) for x in _HELV.split()]
_W_BLD = [int(x) for x in _HELB.split()]


def _widths(font):
    return _W_BLD if font in (FBLD,) else _W_REG


def text_width(s, font, size):
    """Width of s in points. Courier is monospace 600/1000 em."""
    if font in (FMON, FMONB):
        return len(s) * size * 0.6
    w = _widths(font)
    total = 0
    for ch in s:
        o = ord(ch)
        total += w[o - 32] if 32 <= o <= 126 else 556
    return total * size / 1000.0


# -------------------------------------------------------- character sanitising
_TRANS = {
    "—": "-", "–": "-", "−": "-", "‘": "'", "’": "'",
    "“": '"', "”": '"', "·": "·", "…": "...",
    "→": "->", "←": "<-", "↑": "^", "↓": "v",
    "↔": "<->", "⇒": "=>", "≥": ">=", "≤": "<=",
    "×": "x", "✓": "v", "✗": "x", "•": "·",
    " ": " ", "≈": "~", "≠": "!=", "°": " deg",
    "█": "#", "│": "|", "─": "-", "┌": "+", "┐": "+",
    "└": "+", "┘": "+", "├": "+", "┤": "+", "┬": "+",
    "┴": "+", "┼": "+", "═": "=", "║": "|",
    "↗": "", "…": "...",
}
# WinAnsi codes we keep as-is beyond ASCII
_WINANSI_OK = {0xb7, 0xa3, 0xa9, 0xae, 0xb0, 0xb1, 0xbd, 0xbc, 0xe9, 0xe8}


def sanitize(s):
    out = []
    for ch in s:
        if ch in _TRANS:
            out.append(_TRANS[ch])
            continue
        o = ord(ch)
        if o < 32:
            out.append(" ")
        elif o <= 126 or o in _WINANSI_OK:
            out.append(ch)
        # else: drop (emoji, box art we did not map, CJK)
    return "".join(out)


def esc(s):
    return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


# ------------------------------------------------------------- inline markdown
TOKEN = re.compile(
    r"(`[^`]+`)"                       # code
    r"|(\*\*\*[^*]+\*\*\*)"            # bold italic
    r"|(\*\*[^*]+\*\*)"                # bold
    r"|(\*[^*\n]+\*)"                  # italic
    r"|(\[[^\]]*\]\([^)]*\))"          # link
)


def inline_runs(text, base_font=FREG, base_size=BODY, base_color=INK):
    """Split markdown inline markup into styled runs."""
    runs = []
    pos = 0
    for m in TOKEN.finditer(text):
        if m.start() > pos:
            runs.append((text[pos:m.start()], base_font, base_size, base_color))
        tok = m.group(0)
        if tok.startswith("`"):
            runs.append((tok[1:-1], FMON, base_size * 0.9, (0.30, 0.13, 0.52)))
        elif tok.startswith("***"):
            runs.extend(inline_runs(tok[3:-3], FBLD, base_size, base_color))
        elif tok.startswith("**"):
            runs.extend(inline_runs(tok[2:-2], FBLD, base_size, base_color))
        elif tok.startswith("*"):
            runs.extend(inline_runs(tok[1:-1], FITL, base_size, base_color))
        elif tok.startswith("["):
            label = tok[1 : tok.index("]")]
            runs.extend(inline_runs(label or "link", base_font, base_size, ACCENT))
        pos = m.end()
    if pos < len(text):
        runs.append((text[pos:], base_font, base_size, base_color))
    return [(sanitize(t), f, s, c) for (t, f, s, c) in runs if t]


def wrap_runs(runs, max_w):
    """Greedy word-wrap a run list into lines of runs."""
    lines, cur, cur_w = [], [], 0.0
    for text, font, size, color in runs:
        parts = re.split(r"(\s+)", text)
        for part in parts:
            if not part:
                continue
            w = text_width(part, font, size)
            if part.isspace():
                if cur and cur_w + w <= max_w:
                    cur.append((part, font, size, color))
                    cur_w += w
                continue
            if cur_w + w > max_w and cur:
                while cur and cur[-1][0].isspace():
                    cur.pop()
                lines.append(cur)
                cur, cur_w = [], 0.0
            if w > max_w:  # single token longer than the line: hard split
                acc = ""
                for ch in part:
                    cwd = text_width(acc + ch, font, size)
                    if cwd > max_w and acc:
                        lines.append([(acc, font, size, color)])
                        acc = ch
                    else:
                        acc += ch
                if acc:
                    cur.append((acc, font, size, color))
                    cur_w += text_width(acc, font, size)
                continue
            cur.append((part, font, size, color))
            cur_w += w
    if cur:
        while cur and cur[-1][0].isspace():
            cur.pop()
        if cur:
            lines.append(cur)
    return lines or [[]]


# ------------------------------------------------------------------ PDF writer
class Doc:
    def __init__(self, title=""):
        self.title = title
        self.pages = []
        self.buf = []
        self.y = PH - MT
        self._new_page()

    # -- page plumbing
    def _new_page(self):
        if self.buf:
            self.pages.append("\n".join(self.buf))
        self.buf = []
        self.y = PH - MT

    def need(self, h):
        if self.y - h < MB:
            self._new_page()
            return True
        return False

    def finish_pages(self):
        if self.buf:
            self.pages.append("\n".join(self.buf))
            self.buf = []

    # -- primitives
    def rect(self, x, y, w, h, color, fill=True):
        r, g, b = color
        if fill:
            self.buf.append(f"q {r:.3f} {g:.3f} {b:.3f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f Q")
        else:
            self.buf.append(
                f"q {r:.3f} {g:.3f} {b:.3f} RG 0.6 w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S Q"
            )

    def line(self, x1, y1, x2, y2, color, w=0.8):
        r, g, b = color
        self.buf.append(
            f"q {r:.3f} {g:.3f} {b:.3f} RG {w} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S Q"
        )

    def show(self, x, y, runs):
        """Draw one line of runs at baseline y."""
        if not runs:
            return
        self.buf.append("BT")
        cx = x
        for text, font, size, color in runs:
            r, g, b = color
            self.buf.append(f"{r:.3f} {g:.3f} {b:.3f} rg /{font} {size:.2f} Tf")
            self.buf.append(f"1 0 0 1 {cx:.2f} {y:.2f} Tm ({esc(text)}) Tj")
            cx += text_width(text, font, size)
        self.buf.append("ET")

    # -- block elements
    def para(self, runs, lead=LEAD, indent=0.0, gap_after=5.0, bullet=None):
        avail = CW - indent
        lines = wrap_runs(runs, avail)
        for i, ln in enumerate(lines):
            self.need(lead)
            base = self.y - lead * 0.78
            if i == 0 and bullet is not None:
                bx = ML + indent - text_width(bullet, FREG, BODY) - 4
                self.show(bx, base, [(bullet, FREG, BODY, MUTED)])
            self.show(ML + indent, base, ln)
            self.y -= lead
        self.y -= gap_after

    def heading(self, level, text):
        size = {1: H1, 2: H2, 3: H3}[level]
        lead = size * 1.22
        space_before = {1: 0.0, 2: 19.0, 3: 12.0}[level]
        self.y -= space_before
        # keep heading with at least two body lines
        if self.y - (lead + LEAD * 2) < MB:
            self._new_page()
        if level == 2:
            self.line(ML, self.y + 7, ML + CW, self.y + 7, INK, 1.4)
            self.y -= 3
        runs = inline_runs(text, FBLD, size, INK)
        for ln in wrap_runs(runs, CW):
            self.need(lead)
            self.show(ML, self.y - lead * 0.80, ln)
            self.y -= lead
        self.y -= {1: 6.0, 2: 5.0, 3: 3.0}[level]

    def hrule(self):
        self.need(14)
        self.y -= 6
        self.line(ML, self.y, ML + CW, self.y, RULE, 0.9)
        self.y -= 10

    def code_block(self, lines):
        pad = 7.0
        flat = []
        for raw in lines:
            s = sanitize(raw.replace("\t", "    "))
            if not s:
                flat.append("")
                continue
            while text_width(s, FMON, CODE_FS) > CW - 2 * pad - 6:
                cut = int((CW - 2 * pad - 6) / (CODE_FS * 0.6))
                flat.append(s[:cut])
                s = s[cut:]
            flat.append(s)
        i = 0
        while i < len(flat):
            avail = int((self.y - MB - 2 * pad) // CODE_LEAD)
            if avail < 2:
                self._new_page()
                avail = int((self.y - MB - 2 * pad) // CODE_LEAD)
            chunk = flat[i : i + avail]
            h = len(chunk) * CODE_LEAD + 2 * pad
            top = self.y
            self.rect(ML, top - h, CW, h, SOFT)
            self.rect(ML, top - h, 2.2, h, ACCENT)
            yy = top - pad - CODE_LEAD * 0.78
            for ln in chunk:
                self.show(ML + pad + 5, yy, [(ln, FMON, CODE_FS, (0.137, 0.161, 0.188))])
                yy -= CODE_LEAD
            self.y = top - h - 7
            i += avail

    def quote(self, text_lines):
        pad = 7.0
        runs = inline_runs(" ".join(text_lines), FREG, BODY, (0.094, 0.157, 0.337))
        lines = wrap_runs(runs, CW - 2 * pad - 10)
        h = len(lines) * LEAD + 2 * pad
        if self.y - h < MB and h < (PH - MT - MB):
            self._new_page()
        top = self.y
        h = min(h, top - MB)
        self.rect(ML, top - h, CW, h, QUOTE_BG)
        self.rect(ML, top - h, 2.6, h, ACCENT)
        yy = top - pad - LEAD * 0.78
        for ln in lines:
            if yy < MB:
                break
            self.show(ML + pad + 8, yy, ln)
            yy -= LEAD
        self.y = top - h - 8

    def table(self, rows, has_header=True):
        ncol = max(len(r) for r in rows)
        rows = [r + [""] * (ncol - len(r)) for r in rows]
        # natural widths
        nat = [1.0] * ncol
        for r in rows:
            for i, cell in enumerate(r):
                plain = sanitize(re.sub(r"[`*\[\]]|\([^)]*\)", "", cell))
                nat[i] = max(nat[i], text_width(plain, FREG, TBL_FS) + 12)
        tot = sum(nat)
        if tot <= CW:
            extra = (CW - tot) / ncol
            widths = [w + extra for w in nat]
        else:  # shrink proportionally, keep a floor
            floor = 42.0
            widths = [max(floor, w * CW / tot) for w in nat]
            s = sum(widths)
            if s > CW:
                widths = [w * CW / s for w in widths]
        pad = 4.0

        def row_lines(r, bold):
            out, height = [], 0
            for i, cell in enumerate(r):
                runs = inline_runs(
                    cell, FBLD if bold else FREG, TBL_FS, (1, 1, 1) if bold else INK
                )
                ls = wrap_runs(runs, widths[i] - 2 * pad)
                out.append(ls)
                height = max(height, len(ls))
            return out, height * TBL_LEAD + 2 * pad

        def draw(r, bold, zebra):
            cells, h = row_lines(r, bold)
            if self.y - h < MB:
                self._new_page()
                hc, hh = row_lines(header, True) if has_header else (None, 0)
                if has_header:
                    self._draw_row(hc, hh, widths, pad, HEAD_BG, True)
            self._draw_row(cells, h, widths, pad, HEAD_BG if bold else (ZEBRA if zebra else None), bold)

        header = rows[0] if has_header else None
        start = 0
        if has_header:
            cells, h = row_lines(header, True)
            self.need(h + TBL_LEAD)
            self._draw_row(cells, h, widths, pad, HEAD_BG, True)
            start = 1
        for n, r in enumerate(rows[start:]):
            draw(r, False, n % 2 == 1)
        self.y -= 8

    def _draw_row(self, cells, h, widths, pad, bg, bold):
        top = self.y
        if bg:
            self.rect(ML, top - h, sum(widths), h, bg)
        x = ML
        for i, ls in enumerate(cells):
            yy = top - pad - TBL_LEAD * 0.78
            for ln in ls:
                self.show(x + pad, yy, ln)
                yy -= TBL_LEAD
            self.line(x, top, x, top - h, RULE, 0.5)
            x += widths[i]
        self.line(x, top, x, top - h, RULE, 0.5)
        self.line(ML, top - h, ML + sum(widths), top - h, RULE, 0.5)
        self.line(ML, top, ML + sum(widths), top, RULE, 0.5)
        self.y = top - h

    # -- serialise
    def save(self, path):
        self.finish_pages()
        n = len(self.pages)
        objs = []

        def add(body):
            objs.append(body)
            return len(objs)

        font_ids = {}
        for key, base in (
            (FREG, "Helvetica"), (FBLD, "Helvetica-Bold"), (FITL, "Helvetica-Oblique"),
            (FMON, "Courier"), (FMONB, "Courier-Bold"),
        ):
            font_ids[key] = add(
                f"<< /Type /Font /Subtype /Type1 /BaseFont /{base} "
                f"/Encoding /WinAnsiEncoding >>"
            )
        res = "<< /Font << " + " ".join(f"/{k} {v} 0 R" for k, v in font_ids.items()) + " >> >>"
        res_id = add(res)

        pages_id = len(objs) + 1 + 2 * n + 1  # placeholder, fixed below
        page_ids, content_ids = [], []
        for i, content in enumerate(self.pages):
            footer = (
                "BT 0.357 0.384 0.412 rg /F1 7.60 Tf "
                f"1 0 0 1 {ML:.2f} {MB - 24:.2f} Tm "
                f"({esc(sanitize(self.title))}) Tj ET\n"
                "BT 0.357 0.384 0.412 rg /F1 7.60 Tf "
                f"1 0 0 1 {PW - MR - 46:.2f} {MB - 24:.2f} Tm ({i + 1} / {n}) Tj ET\n"
                f"q 0.886 0.898 0.914 RG 0.6 w {ML:.2f} {MB - 14:.2f} m "
                f"{PW - MR:.2f} {MB - 14:.2f} l S Q"
            )
            stream = (content + "\n" + footer).encode("latin-1", "replace")
            comp = zlib.compress(stream, 9)
            cid = add(
                b"<< /Length " + str(len(comp)).encode() + b" /Filter /FlateDecode >>\nstream\n"
                + comp + b"\nendstream"
            )
            content_ids.append(cid)
        for cid in content_ids:
            page_ids.append(
                add(
                    f"<< /Type /Page /Parent @PAGES@ 0 R /MediaBox [0 0 {PW:.0f} {PH:.0f}] "
                    f"/Resources {res_id} 0 R /Contents {cid} 0 R >>"
                )
            )
        pages_id = add(
            "<< /Type /Pages /Count "
            + str(n)
            + " /Kids ["
            + " ".join(f"{p} 0 R" for p in page_ids)
            + "] >>"
        )
        info_id = add(
            f"<< /Title ({esc(sanitize(self.title))}) /Producer (md2pdf.py, stdlib only) >>"
        )
        cat_id = add(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for i, body in enumerate(objs, start=1):
            offsets.append(len(out))
            if isinstance(body, str):
                body = body.replace("@PAGES@", str(pages_id)).encode("latin-1", "replace")
            out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
        xref = len(out)
        out += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n0000000000 65535 f \n"
        for off in offsets:
            out += f"{off:010d} 00000 n \n".encode()
        out += (
            b"trailer\n<< /Size " + str(len(objs) + 1).encode()
            + b" /Root " + str(cat_id).encode() + b" 0 R"
            + b" /Info " + str(info_id).encode() + b" 0 R >>\nstartxref\n"
            + str(xref).encode() + b"\n%%EOF\n"
        )
        with open(path, "wb") as fh:
            fh.write(out)
        return n


# ------------------------------------------------------------------- md parsing
def render(md, title=""):
    doc = Doc(title)
    lines = md.replace("\r\n", "\n").split("\n")
    i, n = 0, len(lines)
    para_buf, quote_buf = [], []

    def flush_para():
        nonlocal para_buf
        if para_buf:
            doc.para(inline_runs(" ".join(para_buf)))
            para_buf = []

    def flush_quote():
        nonlocal quote_buf
        if quote_buf:
            doc.quote(quote_buf)
            quote_buf = []

    while i < n:
        ln = lines[i]
        s = ln.strip()

        if s.startswith("```"):
            flush_para(); flush_quote()
            i += 1
            block = []
            while i < n and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1
            doc.code_block(block)
            continue

        if s.startswith(">"):
            flush_para()
            quote_buf.append(re.sub(r"^>\s?", "", s))
            i += 1
            continue
        flush_quote()

        if not s:
            flush_para()
            i += 1
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            flush_para()
            doc.heading(min(3, len(m.group(1))), m.group(2).strip())
            i += 1
            continue

        if re.match(r"^(---+|\*\*\*+|___+)$", s):
            flush_para()
            doc.hrule()
            i += 1
            continue

        # GFM table
        if s.startswith("|") and i + 1 < n and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            flush_para()
            rows = []
            header = [c.strip() for c in s.strip().strip("|").split("|")]
            rows.append(header)
            i += 2
            while i < n and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            doc.table(rows, has_header=True)
            continue

        m = re.match(r"^[-*+]\s+\[([ xX])\]\s+(.*)$", s)
        if m:
            flush_para()
            mark = "[x]" if m.group(1).lower() == "x" else "[ ]"
            doc.para(inline_runs(m.group(2)), indent=26, gap_after=1.5, bullet=mark)
            i += 1
            continue

        m = re.match(r"^[-*+]\s+(.*)$", s)
        if m:
            flush_para()
            doc.para(inline_runs(m.group(1)), indent=16, gap_after=1.5, bullet="·")
            i += 1
            continue

        m = re.match(r"^(\d+)[.)]\s+(.*)$", s)
        if m:
            flush_para()
            doc.para(
                inline_runs(m.group(2)), indent=20, gap_after=1.5, bullet=m.group(1) + "."
            )
            i += 1
            continue

        para_buf.append(s)
        i += 1

    flush_para()
    flush_quote()
    return doc


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    src = argv[1]
    out = None
    title = None
    rest = argv[2:]
    k = 0
    while k < len(rest):
        if rest[k] == "--title" and k + 1 < len(rest):
            title = rest[k + 1]
            k += 2
        else:
            out = rest[k]
            k += 1
    if out is None:
        out = re.sub(r"\.md$", "", src) + ".pdf"
    with open(src, encoding="utf-8") as fh:
        md = fh.read()
    if title is None:
        m = re.search(r"^#\s+(.*)$", md, re.M)
        title = m.group(1).strip() if m else src
    doc = render(md, title)
    pages = doc.save(out)
    print(f"{out} ({pages} pages)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
