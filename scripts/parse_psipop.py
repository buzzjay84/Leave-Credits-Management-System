import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUT_FILE = PROJECT_ROOT / 'scripts/psipop_parsed.json'
VACANT_OUT_FILE = PROJECT_ROOT / 'src/renderer/data/vacantItems.json'


def latest_psipop_dir():
    override = os.environ.get('LCMS_PSIPOP_DIR')
    if override:
        source = Path(override).resolve()
        if not list(source.glob('*PSIPOP.pdf')):
            raise RuntimeError(f'No PSIPOP PDFs found in LCMS_PSIPOP_DIR: {source}')
        return source

    candidates = []
    for directory in (PROJECT_ROOT / 'src').iterdir():
        if not directory.is_dir():
            continue
        pdfs = list(directory.glob('*PSIPOP.pdf'))
        if pdfs:
            candidates.append((max(pdf.stat().st_mtime for pdf in pdfs), directory))
    if not candidates:
        raise RuntimeError('No folder containing *PSIPOP.pdf files was found under src/.')
    return max(candidates, key=lambda candidate: candidate[0])[1]

OFFICE_HEADER_RE = re.compile(r'^\d{4}\.\d{4}\s+(.+)$')
BOILERPLATE_SUBSTRINGS = (
    'Republic of the Philippines',
    'DEPARTMENT OF BUDGET AND MANAGEMENT',
    'PERSONAL SERVICES ITEMIZATION',
    'Record No.',
    'for the Fiscal Year',
    'Page ',
    'Department:',
    'Total Positions:',
    'This text provides space before the ff. row',
    'No. of Filled Positions',
    'No. of Unfilled Positions',
    'No. of Itemized Positions',
    'Subtotal No. of',
    'Grand Total No. of',
    'I certify to the correctness',
    'whose names appear',
    'APPROVED BY:',
    'Human Resource Management Officer',
    'Head of Agency',
    'SALARY GRADE AUTHORIZED',
    'Remarks:',
    'NOTHING FOLLOWS',
    'ANABELLE R. BARANDINO',
    'ANABELLE R. BARANIDO',
    'MA. LAARNI T. VILLANUEVA',
    'Department of Budget and Management I certify',
    'ITEM NUMBER',
    'POSITION TITLE',
)
HEADER_TOKEN_LINES = {
    'S', 'ANNUAL SALARY AREA L T', 'S P/P/A DATE OF DATE OF CIVIL', 'C T E S A',
    'O Y V E T', 'D P E X U', 'P BIRTH', 'E E L S', '(CT)',
}

ITEM_START_RE = re.compile(r'^[A-Z0-9][A-Z0-9\-]*\d{4}(-\d{4})?\s')
TAIL_RE = re.compile(
    r'^(?P<pos>.+?)\s+(?:\([A-Z]{1,6}\)\s+)?(?P<auth>[\d,]+)\s+(?P<actual>[\d,]+)\s+'
    r'(?P<step>\d+)\s+(?P<area>\S+)\s+(?P<r>[A-Z])\s+(?P<t>[A-Z])\s+(?P<org>\d{6,})\s*(?P<rest>.*)$'
)
# Rare PDF text-extraction glitch: the STEP and AREA columns render with no
# space between them (e.g. "13552" instead of "1 3552").
TAIL_RE_SQUISHED = re.compile(
    r'^(?P<pos>.+?)\s+(?:\([A-Z]{1,6}\)\s+)?(?P<auth>[\d,]+)\s+(?P<actual>[\d,]+)\s+'
    r'(?P<step>\d{1,2})(?P<area>\d{3,4})\s+(?P<r>[A-Z])\s+(?P<t>[A-Z])\s+(?P<org>\d{6,})\s*(?P<rest>.*)$'
)
GRADE_SUFFIX_RE = re.compile(r'^(?P<title>.+?)\s*-\s*(?P<grade>\d{1,2})$')
POSITION_CONTINUATION_RE = re.compile(
    r"^(?P<cont>[A-Z0-9()/,.' \-]*?)\s*-\s*(?P<grade>\d{1,2})(?:\s+(?P<trailing_name>[A-ZÑ\-\.' ]+))?\s*$"
)
# When the title's trailing "- NN" dash lands on line 1 but the grade digits wrap
# to line 2 alone (e.g. "CHIEF EDUCATION SUPERVISOR -" / "16").
GRADE_ONLY_CONTINUATION_RE = re.compile(
    r"^(?P<grade>\d{1,2})(?:\s+(?P<trailing_name>[A-ZÑ\-\.' ]+))?\s*$"
)
REST_RE = re.compile(
    r'^(?P<name>[A-ZÑ\-\.\' ]+,\s*[A-ZÑ\-\.\' ]+?)\s+(?P<sex>[MF])\s+'
    r'(?P<dob>\d{2}/\d{2}/\d{2})\s+(?P<tin>[\dN/A\-]+)\s+'
    r'(?P<appt>\d{2}/\d{2}/\d{2})\s+(?P<promo>\d{2}/\d{2}/\d{2})\s+'
    r'(?P<status>\S+)\s+(?P<elig>.*)$'
)


def is_boilerplate(line):
    stripped = line.strip()
    if not stripped:
        return True
    if stripped in HEADER_TOKEN_LINES:
        return True
    if re.match(r'^\(\d\)', stripped):
        return True
    for sub in BOILERPLATE_SUBSTRINGS:
        if sub in stripped:
            return True
    return False


def looks_like_record_start(line):
    stripped = line.strip()
    if not ITEM_START_RE.match(stripped):
        return False
    tokens = stripped.split(None, 1)
    if len(tokens) < 2:
        return False
    return bool(TAIL_RE.match(tokens[1]))


def parse_pdf(path):
    records = []
    anomalies = []
    current_office = None
    with pdfplumber.open(path) as pdf:
        all_lines = []
        for page in pdf.pages:
            text = page.extract_text() or ''
            all_lines.extend(text.split('\n'))

    i = 0
    n = len(all_lines)
    while i < n:
        raw = all_lines[i]
        line = raw.strip()
        office_match = OFFICE_HEADER_RE.match(line)
        if office_match:
            current_office = office_match.group(1).strip()
            i += 1
            continue
        if is_boilerplate(line):
            i += 1
            continue

        if not ITEM_START_RE.match(line):
            anomalies.append({'file': path.name, 'line': line, 'reason': 'no_item_start'})
            i += 1
            continue

        item_number, remainder = line.split(None, 1)
        tm = TAIL_RE.match(remainder) or TAIL_RE_SQUISHED.match(remainder)
        if not tm:
            anomalies.append({'file': path.name, 'line': line, 'reason': 'no_tail_match'})
            i += 1
            continue

        pos_blob = tm.group('pos').strip()
        i += 1

        gm = GRADE_SUFFIX_RE.match(pos_blob)
        leading_name_continuation = None
        if gm:
            position_title = gm.group('title').strip()
            grade = gm.group('grade')
        elif pos_blob.endswith('-') and i < n and GRADE_ONLY_CONTINUATION_RE.match(all_lines[i].strip()):
            # The dash stayed on line 1; only the grade digits wrapped to line 2.
            gm2 = GRADE_ONLY_CONTINUATION_RE.match(all_lines[i].strip())
            position_title = pos_blob[:-1].strip()
            grade = gm2.group('grade')
            leading_name_continuation = gm2.group('trailing_name')
            i += 1
        else:
            # Long position titles wrap: grade suffix lives on the next line alone.
            if i < n:
                cont = all_lines[i].strip()
                cm = POSITION_CONTINUATION_RE.match(cont)
            else:
                cm = None
            if cm:
                position_title = (pos_blob + ' ' + cm.group('cont').strip()).strip()
                grade = cm.group('grade')
                i += 1
                leading_name_continuation = cm.group('trailing_name')
            else:
                anomalies.append({'file': path.name, 'item_number': item_number, 'pos_blob': pos_blob, 'reason': 'no_grade_suffix'})
                position_title = pos_blob
                grade = None
                leading_name_continuation = None

        rest = tm.group('rest').strip()

        # Peek ahead for a wrapped continuation of the incumbent's name.
        continuation_parts = [leading_name_continuation.strip()] if leading_name_continuation else []
        j = i
        while j < n:
            nxt = all_lines[j].strip()
            if not nxt:
                j += 1
                continue
            if is_boilerplate(nxt) or OFFICE_HEADER_RE.match(nxt) or looks_like_record_start(nxt) or POSITION_CONTINUATION_RE.match(nxt):
                break
            continuation_parts.append(nxt)
            j += 1
        if continuation_parts and rest:
            rest = rest + ' ' + ' '.join(continuation_parts)
            i = j

        record = {
            'file': path.name,
            'office': current_office,
            'item_number': item_number,
            'position_raw': position_title,
            'salary_grade': grade,
            'auth_salary': tm.group('auth').replace(',', ''),
            'actual_salary': tm.group('actual').replace(',', ''),
            'step': tm.group('step'),
            'area': tm.group('area'),
            'org': tm.group('org'),
        }

        if not rest:
            record['vacant'] = True
            records.append(record)
            continue

        rm = REST_RE.match(rest)
        if not rm:
            record['vacant'] = False
            record['unparsed_rest'] = rest
            anomalies.append({'file': path.name, 'item_number': record['item_number'], 'rest': rest, 'reason': 'rest_unmatched'})
            records.append(record)
            continue

        record.update({
            'vacant': False,
            'name': rm.group('name').strip(),
            'sex': rm.group('sex'),
            'dob': rm.group('dob'),
            'tin': rm.group('tin'),
            'appointment_date': rm.group('appt'),
            'promotion_date': rm.group('promo'),
            'status_code': rm.group('status'),
            'eligibility': rm.group('elig').strip(),
        })
        records.append(record)

    return records, anomalies


def main():
    source_dir = latest_psipop_dir()
    files = sorted(source_dir.glob('*PSIPOP.pdf'))
    print(f'Using latest PSIPOP source: {source_dir} ({len(files)} PDFs)', file=sys.stderr)
    all_records = []
    all_anomalies = []
    for f in files:
        print(f'Parsing {f.name}...', file=sys.stderr)
        records, anomalies = parse_pdf(f)
        filled = [r for r in records if not r.get('vacant')]
        vacant = [r for r in records if r.get('vacant')]
        bad = [r for r in filled if 'unparsed_rest' in r]
        print(f'  total={len(records)} filled={len(filled)} vacant={len(vacant)} unparsed_rest={len(bad)} anomaly_lines={len(anomalies)}', file=sys.stderr)
        all_records.extend(records)
        all_anomalies.extend(anomalies)

    OUT_FILE.write_text(json.dumps({
        'source_dir': str(source_dir.relative_to(PROJECT_ROOT)),
        'source_files': [f.name for f in files],
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'records': all_records,
        'anomalies': all_anomalies,
    }, indent=2, ensure_ascii=False), encoding='utf-8')
    VACANT_OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    vacant_items = sorted(({
        'item_number': record['item_number'],
        'position': record.get('position_raw'),
        'salary_grade': record.get('salary_grade'),
        'office': record.get('office'),
        'source_file': record.get('file'),
    } for record in all_records if record.get('vacant') and record.get('item_number')),
        key=lambda item: (item.get('office') or '', item.get('position') or '', item['item_number']))
    VACANT_OUT_FILE.write_text(json.dumps(vacant_items, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    filled_total = len([r for r in all_records if not r.get('vacant')])
    print(f'\nGRAND TOTAL records={len(all_records)} filled={filled_total} anomalies={len(all_anomalies)}', file=sys.stderr)


if __name__ == '__main__':
    main()
