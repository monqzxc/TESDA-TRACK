"""Import TESDA XLSX registry snapshots. Preview is the default; --apply commits atomically."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from hashlib import sha256
import json
import math
from pathlib import Path
import re
import sys
import unicodedata

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import insert, inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from tesda_track.models import (AssessmentCenter, Qualification, Region, RegistryBatch, RegistryLink,
                                RegistryRecord, TrainingProgram, TrainingProvider)
from tesda_track.registry_xlsx import SourceError, Workbook, sources

VERSION = 1
EMPTY = {'', 'not indicated', 'not available', 'n/a', 'na', 'none', 'null', '-', '0'}
EXCEL_ERRORS = {'#VALUE!', '#REF!', '#DIV/0!', '#NUM!', '#N/A', '#NAME?', '#NULL!'}
TRAINING = {'site':'NAME OF INSTITUTION', 'region':'Region', 'province':'PROVINCE', 'city':'MUNICIPALITY',
            'address':'ADDRESS', 'lat':'Latitude Point', 'lon':'Longitude Point', 'phone':'TEL. NO.',
            'email':'E-mail Address', 'qualification':'PROGRAM', 'source_id':'CTPR Number',
            'issued':'DATE ISSUED', 'expires':'EXPIRATION DATE', 'duration':'DURATION', 'category':'STATUS'}
ASSESSMENT = {'site':'Assessment Center', 'region':'Region Name', 'province':'Province Name', 'city':'City Name',
              'address':'Address', 'lat':'Latitude', 'lon':'Longtitude', 'phone':'Phone',
              'qualification':'Qualification', 'source_id':'Accreditation no', 'issued':'Date Accredited',
              'expires':'Date of Expiry'}
REGIONS = {'iv-b':'MIMAROPA', 'ivb':'MIMAROPA', 'iva':'IV-A', 'caraga':'XIII',
    'national capital region (ncr)':'NCR', 'cordillera administrative region (car)':'CAR',
    'region i - ilocos':'I', 'region ii - cagayan valley':'II', 'region iii - central luzon':'III',
    'region iva - calabarzon':'IV-A', 'region ivb - mimaropa':'MIMAROPA', 'region v - bicol':'V',
    'region vi - western visayas':'VI', 'region vii - central visayas':'VII', 'region viii - eastern visayas':'VIII',
    'region ix - zamboanga peninsula':'IX', 'region x - northern mindanao':'X', 'region xi - davao':'XI',
    'region xii - soccsksargen':'XII', 'region xiii - caraga':'XIII',
    'bangsamoro autonomous region in muslim mindanao (barmm)':'BARMM'}


def clean(value):
    value = str(value).strip() if value is not None else ''
    return None if value.casefold() in EMPTY else value


def norm(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(value or '').strip())).casefold()


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def source_date(value, date1904=False):
    value = clean(value)
    if value is None:
        return None
    for fmt in ('%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    try:
        serial = float(value)
        # Excel's 1900 leap-day bug is handled for modern records by the 1899-12-30 epoch.
        if not math.isfinite(serial) or serial < 61 or serial > 100000:
            return None
        return (date(1904, 1, 1) if date1904 else date(1899, 12, 30)) + timedelta(days=int(serial))
    except (ValueError, OverflowError):
        return None


def coordinates(lat, lon):
    try:
        lat, lon = float(lat), float(lon)
        if not all(math.isfinite(n) for n in (lat, lon)):
            raise ValueError
    except (ValueError, TypeError):
        return None, None, 'coordinates_missing_or_nonnumeric'
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        flag = 'coordinates_possible_swap' if -90 <= lon <= 90 and -180 <= lat <= 180 else 'coordinates_invalid'
        return None, None, flag
    if not (4 <= lat <= 22 and 116 <= lon <= 127):
        return None, None, 'coordinates_outside_philippines_review'
    return lat, lon, None


def normalized_mapping(raw, qualifications, regions):
    if not isinstance(raw, dict) or set(raw) - {'qualifications', 'regions'}:
        raise SourceError('Mapping must be an object with qualifications and/or regions objects.')
    result = {}
    for kind, targets in (('qualifications', set(qualifications.values())), ('regions', regions)):
        section = raw.get(kind, {})
        if not isinstance(section, dict):
            raise SourceError(f'Mapping {kind} must be an object.')
        result[kind] = {}
        for original, target in section.items():
            if not isinstance(target, str) or target not in targets or not norm(original):
                raise SourceError(f'Mapping {kind} contains an unknown target or empty source name.')
            key = norm(original)
            if key in result[kind] and result[kind][key] != target:
                raise SourceError(f'Mapping {kind} contains conflicting normalized aliases.')
            if kind == 'qualifications' and key in qualifications and qualifications[key] != target:
                raise SourceError('A qualification alias cannot override an exact catalog-name match.')
            result[kind][key] = target
    return result


@dataclass
class Row:
    number: int
    payload: dict
    source_id: str | None
    qualification_code: str | None
    site_key: str
    site: dict
    issued: date | None
    expires: date | None
    duration: int | None
    outcome: str
    reasons: list[str] = field(default_factory=list)


@dataclass
class Plan:
    name: str
    sha256: str
    kind: str
    sheet: str
    snapshot: date
    as_of: date
    policy_hash: str
    fingerprint: str
    rows: list[Row]
    policy: dict

    def report(self):
        return {'source_name':self.name, 'source_sha256':self.sha256, 'kind':self.kind, 'sheet':self.sheet,
            'snapshot_date':str(self.snapshot), 'as_of':str(self.as_of), 'fingerprint':self.fingerprint,
            'policy_sha256':self.policy_hash, 'policy':self.policy,
            'rows':len(self.rows), 'outcomes':dict(Counter(r.outcome for r in self.rows)),
            'issues':dict(Counter(flag for r in self.rows for flag in r.reasons)),
            'accepted_sites':len({r.site_key for r in self.rows if r.outcome == 'accepted'}),
            'unmapped_qualifications':dict(Counter(r.payload.get('qualification') for r in self.rows
                if 'qualification_unmapped' in r.reasons)),
            'unmapped_regions':dict(Counter(r.payload.get('region') for r in self.rows if 'region_unmapped' in r.reasons)),
            'review_rows':[{'row':r.number, 'outcome':r.outcome, 'reasons':r.reasons} for r in self.rows
                if r.reasons or r.outcome != 'accepted']}


def read_plans(path, qualification_names, region_codes, mapping, snapshots, as_of):
    policy = {'version':VERSION, 'catalog':qualification_names, 'regions':sorted(region_codes), 'mapping':mapping}
    policy_hash = digest(policy)
    plans = []
    for name, content in sources(path):
        workbook = Workbook(content)
        try:
            found = False
            for sheet in workbook.sheets:
                iterator = workbook.rows(sheet)
                first = next(iterator, None)
                if first is None:
                    continue
                headers = first[1]
                kind = 'training' if set(TRAINING.values()).issubset(headers) else (
                    'assessment' if set(ASSESSMENT.values()).issubset(headers) else None)
                if kind is None:
                    continue
                found = True
                fields = TRAINING if kind == 'training' else ASSESSMENT
                if snapshots.get(kind) is None or snapshots[kind] > as_of:
                    raise SourceError(f'Provide a {kind} snapshot date on or before the inspection date.')
                rows = []
                for number, values in iterator:
                    if not any(v is not None and str(v).strip() for v in values):
                        continue
                    raw = dict(zip(headers, values))
                    # Keep only operational source fields; trainer/manager identities are not needed.
                    payload = {f:raw.get(h) for f,h in fields.items()}
                    site_name, q_name = clean(payload['site']), clean(payload['qualification'])
                    reasons, blocking = [], []
                    if not site_name or not q_name:
                        blocking.append('site_or_qualification_missing')
                    region_key = norm(payload['region'])
                    region = mapping['regions'].get(region_key) or REGIONS.get(region_key) or next(
                        (r for r in region_codes if norm(r) == region_key), None)
                    if region not in region_codes:
                        region = None
                        blocking.append('region_unmapped')
                    code = qualification_names.get(norm(q_name)) or mapping['qualifications'].get(norm(q_name))
                    if code is None:
                        blocking.append('qualification_unmapped')
                    issued, expires = source_date(payload['issued'], workbook.date1904), source_date(payload['expires'], workbook.date1904)
                    if issued is None or expires is None:
                        blocking.append('authorization_dates_missing_or_invalid')
                    elif expires < issued:
                        blocking.append('expiry_before_issue')
                    elif issued > as_of or issued > snapshots[kind]:
                        blocking.append('issue_after_inspection_or_snapshot')
                    source_id = clean(payload['source_id'])
                    if source_id is None or source_id in EXCEL_ERRORS or len(source_id) > 300:
                        source_id = None
                        blocking.append('registration_id_missing_or_too_long')
                    lat, lon, flag = coordinates(payload['lat'], payload['lon'])
                    if flag:
                        reasons.append(flag)
                    site = {'name':site_name, 'region_code':region, 'province':clean(payload['province']),
                            'city':clean(payload['city']), 'address':clean(payload['address']),
                            'latitude':lat, 'longitude':lon, 'contact_phone':clean(payload.get('phone'))}
                    email = clean(payload.get('email'))
                    if kind == 'training':
                        try:
                            site['contact_email'] = validate_email(email, check_deliverability=False).normalized if email else None
                        except EmailNotValidError:
                            site['contact_email'] = None
                            reasons.append('contact_email_invalid_or_multiple')
                    if site['contact_phone'] and (site['contact_phone'] in EXCEL_ERRORS or len(site['contact_phone']) > 50):
                        site['contact_phone'] = None
                        reasons.append('contact_phone_invalid_or_too_long')
                    for f, limit in (('name',200), ('province',100), ('city',100), ('address',300)):
                        if site[f] and len(site[f]) > limit:
                            blocking.append(f'site_{f}_too_long')
                    if q_name and len(q_name) > 200:
                        blocking.append('program_title_too_long')
                    duration = None
                    if kind == 'training':
                        match = re.fullmatch(r'\s*(\d+)\s*(?:hours?|hrs?\.?|h)\s*', clean(payload.get('duration')) or '', re.I)
                        if match and 0 < int(match[1]) <= 2147483647:
                            duration = int(match[1])
                        else:
                            reasons.append('duration_unknown_or_requires_review')
                    site_key = digest([kind, *(norm(site[f]) for f in ('region_code','province','city','name','address'))])
                    outcome = 'accepted' if not blocking else 'review'
                    if 'site_or_qualification_missing' in blocking:
                        outcome = 'rejected'
                    elif issued and expires and issued <= expires and expires < as_of:
                        outcome = 'historical'
                        reasons.append('authorization_expired')
                    elif expires == as_of:
                        blocking.append('authorization_expires_today')
                        outcome = 'review'
                    rows.append(Row(number, payload, source_id, code, site_key, site, issued, expires, duration,
                                    outcome, reasons + blocking))
                # Never silently choose one conflicting row for the same external registration ID.
                groups = defaultdict(list)
                for row in rows:
                    if row.source_id:
                        groups[row.source_id].append(row)
                for group in groups.values():
                    if len(group) < 2:
                        continue
                    if len({digest(r.payload) for r in group}) == 1:
                        for row in group[1:]:
                            row.outcome = 'duplicate'
                            row.reasons.append('identical_duplicate_registration')
                    else:
                        for row in group:
                            row.reasons.append('conflicting_duplicate_registration')
                            if row.outcome == 'accepted':
                                row.outcome = 'review'
                # Conflicting valid coordinates for one site must not pick an arbitrary map point.
                sites = defaultdict(list)
                for row in rows:
                    if row.outcome == 'accepted':
                        sites[row.site_key].append(row)
                for group in sites.values():
                    points = {(r.site['latitude'], r.site['longitude']) for r in group if r.site['latitude'] is not None}
                    if len(points) > 1:
                        for row in group:
                            row.site.update(latitude=None, longitude=None)
                            row.reasons.append('site_coordinates_conflict')
                source_hash = sha256(content).hexdigest()
                fingerprint = digest([source_hash, kind, sheet, str(snapshots[kind]), str(as_of), policy_hash])
                plans.append(Plan(name, source_hash, kind, sheet, snapshots[kind], as_of, policy_hash, fingerprint, rows, policy))
            if not found:
                raise SourceError(f'No supported registry worksheet found in {name}.')
        finally:
            workbook.close()
    return plans


def catalog_context(session):
    qualifications = session.exec(select(Qualification).where(Qualification.is_active)).all()
    names = {}
    for q in qualifications:
        if norm(q.name) in names and names[norm(q.name)] != q.code:
            raise SourceError('Active catalog has ambiguous normalized qualification names.')
        names[norm(q.name)] = q.code
    return names, {q.code:q.id for q in qualifications}, set(session.exec(select(Region.code)))


def apply_plans(session, plans, qualification_ids):
    if not {'registry_batch','registry_record','registry_link'}.issubset(inspect(session.get_bind()).get_table_names()):
        raise SourceError('Run python -m alembic upgrade head before applying registry imports.')
    # Serialize import writers; one caller commits the complete set of source batches.
    session.execute(text('SELECT pg_advisory_xact_lock(984125762)'))
    links = {(link.entity_kind,link.external_key):link for link in session.exec(select(RegistryLink))}
    operational = {}
    result = Counter()

    def target(kind, key, snapshot, values, model):
        cache_key = (kind,key)
        if cache_key in operational:
            cached = operational[cache_key]
            if kind == 'program' and (cached.provider_id != values['provider_id'] or cached.qualification_id != values['qualification_id']):
                raise SourceError('Conflicting registration targets across supplied source files. Reconcile them before applying.')
            return cached
        link = links.get(cache_key)
        attr = {'provider':'provider_id','program':'program_id','center':'center_id'}[kind]
        if link is None:
            item = model(**values)
            session.add(item)
            session.flush()
            link = RegistryLink(entity_kind=kind, external_key=key, last_snapshot_date=snapshot, **{attr:item.id})
            session.add(link)
            links[cache_key] = link
            result[f'{kind}s_created'] += 1
        else:
            item = session.get(model, getattr(link,attr))
            if item is None:
                raise SourceError('An import link has a missing target; reconcile it before importing.')
            if kind == 'program' and (item.provider_id != values['provider_id'] or item.qualification_id != values['qualification_id']):
                raise SourceError('A registration changed institution or qualification. Reconcile its external identity before applying.')
            # Older or same-date snapshots cannot overwrite curated operational data.
            if snapshot > link.last_snapshot_date:
                protected = {'provider_id','qualification_id','is_active','delivery_mode'} if kind == 'program' else {'is_active'}
                for name,value in values.items():
                    if name not in protected:
                        setattr(item,name,value)
                link.last_snapshot_date = snapshot
                result[f'{kind}s_refreshed'] += 1
        operational[cache_key] = item
        return item

    for plan in plans:
        if session.exec(select(RegistryBatch.id).where(RegistryBatch.fingerprint == plan.fingerprint)).first() is not None:
            result['batches_already_applied'] += 1
            continue
        summary = plan.report()
        batch = RegistryBatch(fingerprint=plan.fingerprint, source_name=plan.name, source_sha256=plan.sha256,
            kind=plan.kind, sheet=plan.sheet, snapshot_date=plan.snapshot, inspected_on=plan.as_of,
            policy_sha256=plan.policy_hash, summary={k:v for k,v in summary.items() if k != 'review_rows'})
        session.add(batch)
        session.flush()
        # Latest authorization rows supply metadata first; keep every original row in history.
        for row in sorted(plan.rows, key=lambda r:(r.issued or date.min, -r.number), reverse=True):
            if row.outcome != 'accepted':
                continue
            if plan.kind == 'training':
                provider = target('provider', row.site_key, plan.snapshot, row.site, TrainingProvider)
                target('program', digest(['training-registration', row.source_id]), plan.snapshot,
                    {'provider_id':provider.id, 'qualification_id':qualification_ids[row.qualification_code],
                     'title':clean(row.payload['qualification']), 'duration_hours':row.duration,
                     'delivery_mode':'unknown'}, TrainingProgram)
            else:
                target('center', row.site_key, plan.snapshot, row.site, AssessmentCenter)
        records = [{'batch_id':batch.id, 'row_number':r.number, 'site_key':r.site_key, 'source_record_id':r.source_id,
            'outcome':r.outcome, 'reasons':r.reasons, 'payload':r.payload,
            'qualification_id':qualification_ids.get(r.qualification_code)} for r in plan.rows]
        for offset in range(0,len(records),500):
            session.execute(insert(RegistryRecord), records[offset:offset+500])
        result['batches_applied'] += 1
        result['source_rows_preserved'] += len(records)
    session.flush()
    return dict(result)


def main(argv=None):
    from tesda_track.db import get_engine
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, action='append', help='XLSX or ZIP; repeat for multiple sources')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', help='Preview only (the default)')
    mode.add_argument('--apply', action='store_true', help='Write accepted records and source history in one transaction')
    parser.add_argument('--training-snapshot', type=date.fromisoformat)
    parser.add_argument('--assessment-snapshot', type=date.fromisoformat)
    parser.add_argument('--as-of', type=date.fromisoformat, default=date.today())
    parser.add_argument('--mapping', type=Path, help='Reviewed qualification/region alias JSON')
    parser.add_argument('--report', type=Path, required=True, help='Output JSON summary and row flags (no contact details)')
    args = parser.parse_args(argv)
    protected = [*args.source, *([args.mapping] if args.mapping else [])]
    if args.report.suffix.casefold() != '.json' or args.report.resolve() in {p.resolve() for p in protected}:
        parser.error('--report must be a separate .json output file.')
    committed = False
    try:
        raw_mapping = json.loads(args.mapping.read_text(encoding='utf-8')) if args.mapping else {}
        with Session(get_engine()) as session:
            names, ids, regions = catalog_context(session)
            mapping = normalized_mapping(raw_mapping, names, regions)
            plans = []
            for path in args.source:
                plans.extend(read_plans(path,names,regions,mapping,
                    {'training':args.training_snapshot, 'assessment':args.assessment_snapshot}, args.as_of))
            if len({p.fingerprint for p in plans}) != len(plans):
                raise SourceError('The same registry source was supplied more than once.')
            output = {'mode':'apply' if args.apply else 'dry-run', 'database_modified':False,
                'importer_version':VERSION, 'sources':[p.report() for p in plans]}
            if args.apply:
                output['applied'] = apply_plans(session,plans,ids)
                session.commit()
                committed = True
                output['database_modified'] = bool(output['applied'].get('batches_applied'))
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
        for plan in plans:
            counts = Counter(r.outcome for r in plan.rows)
            print(f'{plan.kind}: {len(plan.rows)} rows; ' + ', '.join(f'{k}={v}' for k,v in sorted(counts.items())))
        print(f'{output["mode"]}: report saved to {args.report}')
        if args.apply:
            print(json.dumps(output['applied'], sort_keys=True))
        else:
            print('No database writes. Review the report before using --apply.')
        return 0
    except SourceError as error:
        print(f'Import stopped: {error}', file=sys.stderr)
    except (OSError, ValueError, KeyError) as error:
        if committed:
            print('Database import committed, but the report could not be saved. Repeating the same command is safe.', file=sys.stderr)
        else:
            print(f'Import stopped: unable to read source/mapping or invalid workbook ({type(error).__name__}).', file=sys.stderr)
    except SQLAlchemyError:
        # Driver exceptions may contain database credentials or full source payloads.
        print('Import stopped: database operation failed. Check connectivity and run Alembic migrations; no partial transaction was committed.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
