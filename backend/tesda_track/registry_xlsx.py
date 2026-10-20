"""Read XLSX raw values without applying erroneous Excel date styles to phone numbers."""
from io import BytesIO
import posixpath
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
MAX_EXPANDED = 512 * 1024 * 1024


class SourceError(ValueError):
    pass


class Workbook:
    def __init__(self, content: bytes):
        try:
            self.zip = ZipFile(BytesIO(content))
            if sum(info.file_size for info in self.zip.infolist()) > MAX_EXPANDED:
                raise SourceError("Workbook exceeds the 512 MB expanded-size limit.")
            relationships = ET.fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
            targets = {r.attrib["Id"]: r.attrib["Target"] for r in relationships}
            root = ET.fromstring(self.zip.read("xl/workbook.xml"))
            props = root.find(NS + "workbookPr")
            self.date1904 = props is not None and props.get("date1904") in {"1", "true"}
            self.sheets = {}
            for sheet in root.find(NS + "sheets"):
                target = targets[sheet.attrib[REL + "id"]]
                target = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join("xl", target))
                if not target.startswith('xl/') or target not in self.zip.namelist():
                    raise SourceError("Unsupported worksheet relationship.")
                self.sheets[sheet.attrib['name']] = target
            self.strings = []
            if "xl/sharedStrings.xml" in self.zip.namelist():
                with self.zip.open("xl/sharedStrings.xml") as stream:
                    for _, node in ET.iterparse(stream, events=('end',)):
                        if node.tag == NS + 'si':
                            self.strings.append(''.join(t.text or '' for t in node.iter(NS + 't')))
                            node.clear()
        except (BadZipFile, KeyError, ET.ParseError) as error:
            raise SourceError("Invalid or unsupported XLSX workbook.") from error

    def rows(self, sheet):
        with self.zip.open(self.sheets[sheet]) as stream:
            for _, node in ET.iterparse(stream, events=('end',)):
                if node.tag != NS + 'row':
                    continue
                values = {}
                for cell in node.findall(NS + 'c'):
                    letters = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                    column = 0
                    for letter in letters:
                        column = column * 26 + ord(letter.upper()) - 64
                    value = cell.find(NS + 'v')
                    raw = value.text if value is not None else None
                    kind = cell.get('t')
                    if kind == 's' and raw is not None:
                        try:
                            raw = self.strings[int(raw)]
                        except (IndexError, ValueError) as error:
                            raise SourceError('Invalid shared-string reference in worksheet.') from error
                    elif kind == 'inlineStr':
                        raw = ''.join(t.text or '' for t in cell.iter(NS + 't'))
                    values[column - 1] = raw
                yield int(node.attrib['r']), [values.get(i) for i in range(max(values, default=-1) + 1)]
                node.clear()

    def close(self):
        self.zip.close()


def sources(path: Path):
    if path.suffix.casefold() == '.xlsx':
        if path.stat().st_size > MAX_EXPANDED:
            raise SourceError("Source file is too large.")
        yield path.name, path.read_bytes()
        return
    if path.suffix.casefold() != '.zip':
        raise SourceError("Sources must be .xlsx or .zip files containing .xlsx files.")
    try:
        with ZipFile(path) as archive:
            entries = [i for i in archive.infolist() if not i.is_dir() and i.filename.casefold().endswith('.xlsx')]
            if not entries or len(entries) > 20 or sum(i.file_size for i in entries) > MAX_EXPANDED:
                raise SourceError("Archive must contain 1–20 XLSX files totaling at most 512 MB.")
            for entry in entries:
                yield Path(entry.filename).name, archive.read(entry)
    except BadZipFile as error:
        raise SourceError('Invalid ZIP archive.') from error
