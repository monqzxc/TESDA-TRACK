from datetime import date
from io import BytesIO
import json
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile

import pytest
from sqlmodel import select

from tesda_track.models import (AssessmentCenter, AssessmentSchedule, RegistryBatch, RegistryLink,
                                RegistryRecord, ServiceVerification, TrainingProgram, TrainingProvider)
from tesda_track.registry_import import (ASSESSMENT, TRAINING, apply_plans, catalog_context, coordinates,
    main, normalized_mapping, read_plans, source_date)
from tesda_track.registry_xlsx import SourceError, Workbook

TODAY = date(2026, 10, 14)


def xlsx(fields, rows, sheet='Registry'):
    headers = list(fields.values())
    xml_rows = []
    for index, values in enumerate([dict(zip(fields,headers)), *rows], 1):
        cells = []
        for column, key in enumerate(fields, 1):
            letters, n = '', column
            while n:
                n, remainder = divmod(n-1,26)
                letters = chr(65+remainder) + letters
            value = values.get(key)
            if value is None:
                continue
            if isinstance(value,(int,float)):
                # Deliberately style phone numbers as dates: reader must still return raw digits.
                cells.append(f'<c r="{letters}{index}" s="1"><v>{value}</v></c>')
            else:
                cells.append(f'<c r="{letters}{index}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
        xml_rows.append(f'<row r="{index}">{"".join(cells)}</row>')
    buffer = BytesIO()
    with ZipFile(buffer,'w') as z:
        z.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(xml_rows)}</sheetData></worksheet>')
    return buffer.getvalue()


def source_row(**changes):
    row = {'site':'Real Skills Center', 'region':'NCR', 'province':'Metro Manila', 'city':'Manila',
        'address':'1 Main Street', 'lat':14.6, 'lon':120.98, 'phone':9123456789, 'email':'info@example.com',
        'qualification':'Shielded Metal Arc Welding (SMAW) NC II', 'source_id':'CTPR-001',
        'issued':'10/01/2026', 'expires':'10/01/2027', 'duration':'268 hours', 'category':'WTR'}
    return {**row, **changes}


def plans(session,tmp_path,rows=None,fields=TRAINING,kind='training',name='input.xlsx',mapping=None,snapshot=TODAY):
    path = tmp_path/name
    path.write_bytes(xlsx(fields,rows or [source_row()]))
    names,ids,regions = catalog_context(session)
    aliases = normalized_mapping(mapping or {},names,regions)
    return read_plans(path,names,regions,aliases,{kind:snapshot},TODAY), ids


@pytest.mark.parametrize('value,expected', [('10/07/2026',TODAY.replace(day=7)), ('2026-10-07',TODAY.replace(day=7)),
    ('#VALUE!',None), ('6708494',None), ('NaN',None), (None,None), ('0',None), ('46302',date(2026,10,7))])
def test_column_semantic_dates(value,expected):
    assert source_date(value) == expected


@pytest.mark.parametrize('point,flag', [((120.98,14.6),'coordinates_possible_swap'), ((0,0),'coordinates_outside_philippines_review'),
    ((float('nan'),120),'coordinates_missing_or_nonnumeric'), ((200,300),'coordinates_invalid')])
def test_bad_coordinates_are_not_silently_corrected(point,flag):
    assert coordinates(*point) == (None,None,flag)


def test_raw_excel_numeric_phone_is_not_interpreted_as_a_date():
    book = Workbook(xlsx(TRAINING,[source_row()]))
    try:
        rows = list(book.rows('Registry'))
        phone_col = list(TRAINING).index('phone')
        assert rows[1][1][phone_col] == '9123456789'
    finally:
        book.close()


def test_exact_matching_preview_and_apply_are_idempotent_and_fail_closed(session,tmp_path):
    prepared,ids = plans(session,tmp_path)
    before = len(session.exec(select(TrainingProgram)).all())
    assert prepared[0].rows[0].outcome == 'accepted'
    assert len(session.exec(select(TrainingProgram)).all()) == before
    result = apply_plans(session,prepared,ids)
    assert result['providers_created'] == result['programs_created'] == 1
    item = session.exec(select(TrainingProgram).where(TrainingProgram.title == source_row()['qualification'])).one()
    assert item.delivery_mode == 'unknown'
    assert item.start_date is item.end_date is item.slots is item.cost is None
    assert item.availability_status == 'unknown'
    assert item.provider.contact_phone == '9123456789'
    assert session.exec(select(ServiceVerification).where(ServiceVerification.provider_id == item.provider_id)).first() is None
    assert apply_plans(session,prepared,ids) == {'batches_already_applied':1}
    assert len(session.exec(select(RegistryRecord)).all()) == 1


def test_imported_programs_can_be_listed_but_are_not_confirmed_recommendations(session,tmp_path,client):
    prepared,ids = plans(session,tmp_path)
    apply_plans(session,prepared,ids)
    listing = client.get('/api/v1/training-programs',params={'qualification_code':'SMAW-NC-II'})
    assert listing.status_code == 200
    programs = listing.json()
    imported = next(p for p in programs if p['title'] == source_row()['qualification'])
    assert imported['delivery_mode'] == 'unknown'
    assert imported['availability']['status'] == imported['verification']['status'] == 'unknown'
    ranking = client.post('/api/v1/recommendations/training',json={'qualification_code':'SMAW-NC-II'})
    assert ranking.status_code == 200
    assert not any(r['program']['id'] == imported['id'] for r in ranking.json()['results'])
    assert any(r['program']['id'] == imported['id'] for r in ranking.json()['requires_verification'])


def test_unknown_is_not_a_confirmed_delivery_preference(client):
    response = client.post('/api/v1/recommendations/training',json={
        'qualification_code':'SMAW-NC-II','preferred_delivery_mode':'unknown'})
    assert response.status_code == 422


def test_accreditations_preserve_history_without_manufacturing_schedules(session,tmp_path):
    rows = [source_row(source_id='AC-current'), source_row(source_id='AC-old',issued='10/01/2015',expires='10/01/2017'),
            source_row(source_id='AC-unmapped',qualification='New Trade NC II')]
    prepared,ids = plans(session,tmp_path,rows,ASSESSMENT,'assessment')
    assert [r.outcome for r in prepared[0].rows] == ['accepted','historical','review']
    before_schedules = len(session.exec(select(AssessmentSchedule)).all())
    result = apply_plans(session,prepared,ids)
    assert result['centers_created'] == 1
    assert len(session.exec(select(AssessmentSchedule)).all()) == before_schedules
    assert {r.outcome for r in session.exec(select(RegistryRecord))} == {'accepted','historical','review'}


def test_duplicates_and_unmapped_labels_need_explicit_review(session,tmp_path):
    rows = [source_row(), source_row(city='Quezon City'), source_row(source_id='CTPR-002',qualification='Mobile welding NC II')]
    prepared,_ = plans(session,tmp_path,rows)
    assert all(r.outcome == 'review' for r in prepared[0].rows)
    prepared,ids = plans(session,tmp_path,rows[-1:],mapping={'qualifications':{'Mobile welding NC II':'SMAW-NC-II'}})
    assert prepared[0].rows[0].outcome == 'accepted'
    assert apply_plans(session,prepared,ids)['programs_created'] == 1


def test_identical_duplicates_are_retained_once_operationally(session,tmp_path):
    prepared,ids = plans(session,tmp_path,[source_row(),source_row()])
    assert [r.outcome for r in prepared[0].rows] == ['accepted','duplicate']
    assert apply_plans(session,prepared,ids)['programs_created'] == 1
    assert len(session.exec(select(RegistryRecord)).all()) == 2


def test_coordinate_conflicts_are_left_unknown(session,tmp_path):
    prepared,ids = plans(session,tmp_path,[source_row(),source_row(source_id='CTPR-002',lat=14.9)])
    assert all(r.site['latitude'] is None and 'site_coordinates_conflict' in r.reasons for r in prepared[0].rows)
    assert apply_plans(session,prepared,ids)['providers_created'] == 1


@pytest.mark.parametrize('changes,issue', [({'source_id':None},'registration_id_missing_or_too_long'),
    ({'expires':'not a date'},'authorization_dates_missing_or_invalid'),
    ({'issued':'10/20/2026'},'issue_after_inspection_or_snapshot'),
    ({'issued':'11/01/2027'},'expiry_before_issue'),
    ({'region':'Overseas'},'region_unmapped'), ({'expires':'10/14/2026'},'authorization_expires_today')])
def test_missing_or_invalid_authorization_never_becomes_accepted(session,tmp_path,changes,issue):
    prepared,_ = plans(session,tmp_path,[source_row(**changes)])
    assert prepared[0].rows[0].outcome == 'review'
    assert issue in prepared[0].rows[0].reasons


def test_branch_identity_and_existing_manual_sites_are_preserved(session,tmp_path):
    manual = TrainingProvider(name='Real Skills Center', region_code='NCR',city='Manila')
    session.add(manual)
    session.flush()
    prepared,ids = plans(session,tmp_path,[source_row(),source_row(source_id='CTPR-002',address='2 Main Street')])
    assert apply_plans(session,prepared,ids)['providers_created'] == 2
    assert session.get(TrainingProvider,manual.id).address is None


def test_older_snapshots_and_operational_availability_are_preserved(session,tmp_path):
    prepared,ids = plans(session,tmp_path)
    apply_plans(session,prepared,ids)
    link = session.exec(select(RegistryLink).where(RegistryLink.entity_kind == 'program')).one()
    item = session.get(TrainingProgram,link.program_id)
    item.title = 'Curated name'
    item.delivery_mode = 'online'
    item.slots = 10
    older,ids = plans(session,tmp_path,[source_row(issued='10/01/2026',duration='300 hours')],snapshot=date(2026,10,10))
    apply_plans(session,older,ids)
    assert item.title == 'Curated name' and item.duration_hours == 268 and item.slots == 10


def test_changed_registration_target_aborts_instead_of_reassigning(session,tmp_path):
    prepared,ids = plans(session,tmp_path)
    apply_plans(session,prepared,ids)
    changed,ids = plans(session,tmp_path,[source_row(address='New address')])
    with pytest.raises(SourceError,match='changed institution'):
        with session.begin_nested():
            apply_plans(session,changed,ids)
    assert len(session.exec(select(RegistryBatch)).all()) == 1
    assert len(session.exec(select(RegistryLink).where(RegistryLink.entity_kind == 'provider')).all()) == 1


def test_unknown_delivery_is_unresolved_when_mandatory():
    from tesda_track.schemas.learner_assessments import AssessmentAnswers
    from tesda_track.services.personalization import constraint_reasons
    program = TrainingProgram(provider_id=1,qualification_id=1,title='Registry program',delivery_mode='unknown')
    answers = AssessmentAnswers(preferences={'delivery_mode':'online','delivery_is_mandatory':True})
    excluded,reasons = constraint_reasons(answers,program,None)
    assert not excluded and reasons == ['Delivery mode is unknown.']


def test_invalid_aliases_are_rejected(session):
    names,_,regions = catalog_context(session)
    with pytest.raises(SourceError):
        normalized_mapping({'qualifications':{'x':'MADE-UP'}},names,regions)
    with pytest.raises(SourceError):
        normalized_mapping({'qualifications':{'x':'SMAW-NC-II','X':'COOKERY-NC-II'}},names,regions)


def test_cli_defaults_to_no_writes_and_reports_without_contacts(session,tmp_path,monkeypatch):
    from tesda_track import db
    monkeypatch.setattr(db,'get_engine',lambda:session.get_bind())
    path = tmp_path/'input.xlsx'
    path.write_bytes(xlsx(TRAINING,[source_row()]))
    report = tmp_path/'preview.json'
    assert main(['--source',str(path),'--training-snapshot','2026-10-14','--as-of','2026-10-14','--report',str(report)]) == 0
    data = json.loads(report.read_text())
    assert data['mode'] == 'dry-run' and not data['database_modified']
    assert '9123456789' not in report.read_text()
    assert session.exec(select(RegistryBatch)).first() is None


def test_zip_input_supports_both_registry_types(session,tmp_path):
    path = tmp_path/'bundle.zip'
    with ZipFile(path,'w') as z:
        z.writestr('training.xlsx',xlsx(TRAINING,[source_row()]))
        z.writestr('assessment.xlsx',xlsx(ASSESSMENT,[source_row(source_id='AC-001')]))
    names,_,regions = catalog_context(session)
    mapping = normalized_mapping({},names,regions)
    prepared = read_plans(path,names,regions,mapping,{'training':TODAY,'assessment':TODAY},TODAY)
    assert {p.kind for p in prepared} == {'training','assessment'}


def test_newer_snapshot_refresh_preserves_curated_operational_fields(session,tmp_path):
    prepared,ids = plans(session,tmp_path,snapshot=date(2026,10,10))
    apply_plans(session,prepared,ids)
    link = session.exec(select(RegistryLink).where(RegistryLink.entity_kind == 'program')).one()
    item = session.get(TrainingProgram,link.program_id)
    item.delivery_mode = 'online'
    item.slots = 8
    item.cost = 350
    item.start_date = date(2026,11,1)
    newer,ids = plans(session,tmp_path,[source_row(duration='300 hours')])
    result = apply_plans(session,newer,ids)
    assert result['programs_refreshed'] == 1 and item.duration_hours == 300
    assert (item.delivery_mode,item.slots,item.cost,item.start_date) == ('online',8,350,date(2026,11,1))


def test_migration_metadata_has_no_drift(session):
    from alembic import command
    from alembic.config import Config
    config = Config(Path(__file__).resolve().parents[2]/'backend/alembic.ini')
    config.attributes.update(connection=session.get_bind(),configure_logger=False)
    command.check(config)


def test_malformed_archive_is_a_readable_source_error(tmp_path):
    from tesda_track.registry_xlsx import sources
    path = tmp_path/'bad.zip'
    path.write_text('not a zip')
    with pytest.raises(SourceError,match='Invalid ZIP'):
        list(sources(path))


def test_multiple_source_conflict_rolls_back_the_entire_apply(session,tmp_path):
    first,ids = plans(session,tmp_path,name='first.xlsx')
    second,_ = plans(session,tmp_path,[source_row(address='Another branch')],name='second.xlsx')
    with pytest.raises(SourceError,match='across supplied source files'):
        with session.begin_nested():
            apply_plans(session,[*first,*second],ids)
    assert session.exec(select(RegistryBatch)).first() is None
    assert session.exec(select(RegistryLink)).first() is None
    assert session.exec(select(TrainingProvider).where(TrainingProvider.name == 'Real Skills Center')).first() is None


def test_raw_excel_errors_are_not_operational_contacts(session,tmp_path):
    prepared,_ = plans(session,tmp_path,[source_row(phone='#VALUE!',email='#VALUE!')])
    row = prepared[0].rows[0]
    assert row.site['contact_phone'] is row.site['contact_email'] is None
    assert row.payload['phone'] == '#VALUE!'


def test_source_history_can_be_joined_to_imported_sites(session,tmp_path):
    prepared,ids = plans(session,tmp_path)
    apply_plans(session,prepared,ids)
    record = session.exec(select(RegistryRecord)).one()
    link = session.exec(select(RegistryLink).where(RegistryLink.entity_kind == 'provider',RegistryLink.external_key == record.site_key)).one()
    assert link.provider_id is not None
    batch = session.get(RegistryBatch,record.batch_id)
    assert batch.summary['policy']['catalog'][source_row()['qualification'].casefold()] == 'SMAW-NC-II'


def test_large_unresolved_source_retains_every_original_row(session,tmp_path):
    rows = [source_row(source_id=f'CTPR-{i}',qualification='Trade awaiting catalog review') for i in range(1201)]
    prepared,ids = plans(session,tmp_path,rows)
    result = apply_plans(session,prepared,ids)
    records = session.exec(select(RegistryRecord)).all()
    assert result['source_rows_preserved'] == len(records) == 1201
    assert {r.row_number for r in records} == set(range(2,1203))
    assert all(r.outcome == 'review' for r in records)
    assert session.exec(select(RegistryLink)).first() is None


def test_explicit_region_mapping_is_required_for_historical_labels(session,tmp_path):
    prepared,_ = plans(session,tmp_path,[source_row(region='Autonomous Region in Muslim Mindanao (ARMM)')])
    assert prepared[0].rows[0].outcome == 'review'
    # Only a deliberately supplied reviewed alias can resolve the historical label.
    prepared,_ = plans(session,tmp_path,[source_row(region='Historic region')],mapping={'regions':{'Historic region':'NCR'}})
    assert prepared[0].rows[0].outcome == 'accepted'
