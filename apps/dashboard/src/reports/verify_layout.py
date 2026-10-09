"""Check and render all verification PDFs with installed Poppler; no installs."""
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import json
ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / 'docs/evidence/reports-pdf'
checks = []
for language in ['en', 'es']:
    for group in ['a', 'b', 'c']:
        path = EVIDENCE / f'{group}-{language}.pdf'
        bbox = subprocess.check_output(['pdftotext', '-bbox', str(path), '-'])
        root = ET.fromstring(bbox)
        pages = list(root.iter('{http://www.w3.org/1999/xhtml}page'))
        assert len(pages) == 1, (path, len(pages))
        words = list(root.iter('{http://www.w3.org/1999/xhtml}word'))
        assert words
        for word in words:
            x1,y1,x2,y2 = [float(word.attrib[k]) for k in ['xMin','yMin','xMax','yMax']]
            assert 39 <= x1 < x2 <= 557 and 32 <= y1 < y2 <= 802, (path,word.text,word.attrib)
        subprocess.check_call(['pdftoppm','-singlefile','-scale-to','1200','-png',str(path),str(path.with_suffix(''))], stdout=subprocess.DEVNULL)
        checks.append({'file':path.name,'pages':len(pages),'words':len(words),'bounds':'pass','render':'pass'})
(EVIDENCE / 'layout-verification.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(checks,indent=2))
