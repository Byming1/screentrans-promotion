"""Đọc file .xlsx bằng thư viện chuẩn (không cần openpyxl)."""

import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out = []
    for si in root.findall(f"{NS}si"):
        out.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    return out


def col_index(ref):
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def rows(path, sheet="xl/worksheets/sheet1.xml"):
    with zipfile.ZipFile(path) as zf:
        strings = shared_strings(zf)
        root = ET.fromstring(zf.read(sheet))
        for row in root.iter(f"{NS}row"):
            cells = {}
            for c in row.findall(f"{NS}c"):
                v = c.find(f"{NS}v")
                isx = c.find(f"{NS}is")
                if c.get("t") == "s" and v is not None:
                    text = strings[int(v.text)]
                elif isx is not None:
                    text = "".join(t.text or "" for t in isx.iter(f"{NS}t"))
                elif v is not None:
                    text = v.text or ""
                else:
                    text = ""
                cells[col_index(c.get("r"))] = text.strip()
            width = max(cells) + 1 if cells else 0
            yield [cells.get(i, "") for i in range(width)]


if __name__ == "__main__":
    path = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    for i, r in enumerate(rows(path)):
        if i >= limit:
            break
        print(i, "|", " | ".join(r))
