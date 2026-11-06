"""Reproducible mapping audit. Decisions are explicit reviewer judgments, never model scores.
Original files are read only. Unique occurrence keys prevent joins on duplicated source IDs.
"""
import csv,json,re,hashlib,collections
from pathlib import Path
R=Path(__file__).resolve().parents[1];ROOT=R.parents[1]
P=ROOT/"data-review/phase3/research-2026-11-05/datasets";O=R/"datasets"
def read(p):
    with p.open(encoding="utf-8-sig",newline="") as f:return list(csv.DictReader(f))
def write(name,rows,fields=None):
    fields=fields or list(dict.fromkeys(k for r in rows for k in r))
    with (O/name).open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
cat=json.loads((R/"evidence/catalog-snapshot.json").read_text(encoding="utf-8"));bycode={q['code']:q for q in cat}
forecast=read(P/'verified_national_2025_2026_forecast.csv');observed=read(P/'observed_2026_vacancies.csv')
def key(r):return (r['record_id'],r['occupation_title_as_printed'],r.get('sector_as_printed',''),r.get('classification',''))
fidx={key(r):r for r in forecast};assert len(fidx)==442
obsidx={r['record_id']:r for r in observed}
def occurrence(r):return 'OCC-'+hashlib.sha256(json.dumps((r['source_id'],*key(r)),ensure_ascii=False).encode()).hexdigest()[:16]
H='High-confidence proposal';M='Needs manual review';X='Rejected proposal'
def decide(r):
    t=r['occupation_title_as_printed'];c=r['qualification_code'];s=r.get('sector_as_printed','');q=bycode[c]
    if t=='Heavy Equipment Operator':return M,'The forecast does not identify equipment type. '+q['name']+' trains a specific machine; confirm the actual machine and operating duties before linking this broad title.'
    if t=='Welder':return M,'The forecast does not identify welding process, plate/pipe, material or qualification level. '+q['name']+' is a process/material-specific pathway, not a universal match to every welder vacancy.'
    if t=='2D/3D/5D Animator':return M,'The source combines 2D, 3D and an undefined 5D label. This qualification covers only one branch. Preserve the grouped source title and obtain clarification; do not silently split it.'
    if t=='Animator':return M,'Animation is relevant, but the forecast does not distinguish 2D, 3D, clean-up or in-between work. Confirm specialization and role level for '+q['name']+'.'
    if t=='Air-conditioning Technician/Mechanic':return M,'Transportation includes vehicles and premises. Confirm mobile vehicle air-conditioning versus stationary commercial HVAC before choosing '+q['name']+'.'
    if t=='Automotive Chassis Specialist':return H,'The chassis specialization matches the catalog role and chassis diagnosis/repair units, including brakes, steering, suspension and drive lines.'
    if t in ['Automotive Mechanic','Automotive Technician']:return M,'Automotive sector is coherent, but this generic title does not identify chassis, electrical or engine repair. '+q['name']+' is one specialization requiring duty confirmation.'
    if t=='Bakeshop Worker':return M,'Bakery production competencies are relevant, but a bakeshop worker may perform sales or support work. Confirm production duties before proposing the bread/patisserie qualification.'
    if t=='Bread and Pastry Baker':return H,'Baker is an explicit catalog role. Bakery, pastry, desserts and cake production competencies align with the named bakery occupation and food-service sector.'
    if t=='Bookkeeper':return H,'Bookkeeper is an explicit catalog role. Journalizing, posting, trial balance and financial reporting support bookkeeping across the listed employer industries. This is not CPA licensure or accountant equivalence.'
    if t=='Broadband Installer':return M,'The catalog qualification is fixed-wireless broadband installation. The source does not distinguish fixed wireless from fiber/copper installation; confirm the technology.'
    if t=='Bulldozer Operator':return H,'The named machine and occupation match the bulldozer qualification. Productive operation and pre/post-operation checks align with construction equipment duties.'
    if t=='Butcher':return M,'These qualifications train slaughterhouse carcass preparation for particular animals. The hospitality title does not establish slaughterhouse work or animal specialization; retail cutting is not automatically equivalent.'
    if t=='CAD/CAM Operator':return M,'The TR explicitly names CAD/CAM Operator, but its common competencies and sector concern workshop materials, machining and manufacturing CAM. Confirm that construction duties include CAM, rather than architectural CAD drafting alone.'
    if t=='CNC Machinist':return M,'The TR explicitly lists CNC Machinist but its core scope is mold-component machining, fitting and mold assembly. Confirm mold-making duties; generic CNC machining need not entail the whole mold qualification.'
    if t=='Call Center Operator':return H,'The contact-center TR covers inbound/outbound service agents, inquiries, complaints and telemarketing. The occupation identifies the contact-center function even when the employer industry is transportation.'
    if t=='Carpenter':
        return (H,'Rough and finishing carpentry, formwork, frames and wooden components align with construction Carpenter.') if c=='CARPENTRY-NC-II' else (M,'Carpentry NC III is specialized decorative/interior carpentry. The generic Carpenter title does not identify these specialized tasks; confirm the work scope.')
    if t=='Cashier':
        return (H,'Retail Cashier is an explicit TR occupation, supported by retail equipment and register balancing competencies.') if s=='Wholesale and Retail Trade' else (M,'The TR is retail/fast-food customer sales and register handling. A transportation cashier may perform ticketing or fare collection; confirm retail cashiering duties.')
    if t in ['Chef','Cook']:
        if t=='Cook' and c=='COOKERY-NC-II':return H,'Cook is an explicit catalog role and core units cover preparation of the principal dishes, kitchen hygiene and food packaging in food service.'
        return M,'Confirm chef seniority and actual cooking/supervisory/management duties. '+q['name']+' has a particular operative or supervisory scope; a generic '+t+' title does not establish the required level.'
    if t=='Content Creator':return M,'Film/video postproduction explicitly lists Content Creator, but the qualification covers editing and postproduction, not all written, social-media or audio content creation. Confirm media and postproduction duties.'
    if t in ['Customer Service Representative','Customer Support Representative']:
        if c=='CUSTOMER-SERVICES-NC-II':return X,'This proposal applies a retail product-display/selling/register qualification to '+s+' customer service without retail duties. Similar wording does not establish the retail qualification scope.'
        if s=='IT-BPM':return H,'The contact-center TR explicitly includes customer service and technical support. Customer handling, inquiry response and complaint resolution align with the IT-BPM support role.'
        return M,'Public-administration customer service may be face-to-face public assistance rather than contact-center operations. Confirm communication channel and contact-center duties.'
    if t=='Electrician':
        if s=='Construction':return H,'Building wiring, single-phase distribution and electrical protection competencies align with construction electrical installation. The retrieved TR is limited to building systems not exceeding 600 V; do not extend this to high-voltage or all industrial electrical work.'
        return M,'EIM NC II addresses building wiring/systems up to 600 V. The '+s+' title does not distinguish building maintenance from vehicle, utility or other electrical systems; verify the workplace duties.'
    if t=='Emergency Medical Technician':return H,'The explicit catalog occupation and patient assessment, trauma/medical pre-hospital intervention and transport units align. Training relevance does not establish independent medical practice authorization.'
    if t=='Fabricator':return M,'Fabricator is a catalog MMAW role, but the public-administration source does not identify metal fabrication or welding process. Confirm material and MMAW duties.'
    if t=='Food Processor':
        return (H,'Manufacturing food processing aligns with salting/curing, fermentation, drying and thermal processing core units.') if c=='FOOD-PROCESSING-NC-II' else (M,'Food Processing NC III includes line operation/leading-hand or front-line supervisory functions. The source does not establish that level or the particular process.')
    if t=='Food and Beverage Attendant':return H,'The catalog explicitly lists this occupation. Dining-room preparation, guest service and room-service units directly support food-and-beverage service.'
    if t=='Hairdresser':
        return (H,'Junior hairdressing roles and haircutting, coloring, perming and hair/scalp treatment units align with the named occupation.') if c=='HAIRDRESSING-NC-II' else (M,'NC III concerns senior/advanced creative hairstyling. Confirm advanced/senior duties; the generic Hairdresser title supplies no level.')
    if t=='Hatchery Technician':return M,'This qualification is aquatic hatchery operation. Agriculture covers fish and poultry/livestock; confirm species and aquatic hatchery duties before linking the broad title.'
    if t=='Housekeeping Staff':
        return (H,'Guest-room cleaning, public-area cleaning, laundry and guest housekeeping duties align with hotel housekeeping staff.') if c=='HOUSEKEEPING-NC-II' else (M,'The proposed '+q['name']+' covers supervision or management rather than generic operative housekeeping staff. Confirm role seniority and responsibility.')
    if t=='Licensed/Accredited Lifeguard':return M,'Confirm pool versus beach/surf/open-water environment and external licensing/accreditation requirements. This qualification trains a defined aquatic rescue environment and does not itself prove every required accreditation.'
    if t=='Maintenance Technician':
        if s=='Renewable Energy':return X,'Automotive Servicing NC I is motor-vehicle periodic maintenance, not renewable-energy equipment or plant maintenance. No automotive duties are supplied for this source occupation.'
        return M,'The qualification is automotive engine/drivetrain/brake/steering maintenance. Manufacturing Maintenance Technician may concern plant machinery; require evidence of vehicle-maintenance work.'
    if t=='Manicurist/Pedicurist':return H,'The exact catalog role and manicure/pedicure, hand and foot care units match the occupation. It is not a substitute for clinical podiatry.'
    if t=='Massage Therapist':return H,'Massage Therapist is explicitly listed, with client consultation, body massage and practice organization competencies. Health- or hospitality-sector employer location does not change this trade function.'
    if t=='Materials Handler':return H,'The exact catalog occupation and receiving, storing, picking, dispatching and manual handling units align with manufacturing material flows. This is not forklift-operation certification.'
    if t=='Medical Transcriptionist':return H,'Medical terminology and producing text from audio directly support medical transcription; this is not medical coding or clinical practice.'
    if t=='Motorcycle Technician/Mechanic':return H,'The catalog explicitly covers motorcycle/small-engine mechanics and electrical, chassis and engine service units. The source identifies the vehicle/mechanic specialization.'
    if t=='Nail Technician':
        return (H,'Junior Nail Technician and manicure/pedicure/hand-foot care competencies establish an entry nail-care pathway.') if c=='BEAUTY-CARE-SERVICES-NC-II' else (M,'NC III is nail enhancement technology. Confirm enhancement duties and specialist level rather than assuming this from a generic nail-technician title.')
    if t=='Optician':return H,'The explicit catalog role and lens prescription interpretation, edging/mounting and coating units support optical dispensing/lens work. It does not qualify someone as an ophthalmologist or optometrist.'
    if t=='PV Systems Installations':return M,'The qualification scope clearly covers PV installation/testing, but the source label describes an activity in plural rather than a defined occupation. Preserve it unchanged and clarify the intended worker role.'
    if t=='Pastry Chef':return M,'Bread/patisserie NC II prepares baker/commis-pastry functions. A Pastry Chef may supervise or manage production; confirm grade and responsibilities before treating this as a full-role match.'
    if t=='Pharmacy Assistant':return H,'The exact catalog role and inventory, pharmaceutical product handling and dispensing-support units align. This is not pharmacist licensure or independent prescribing.'
    if t=='Pipefitter':return H,'The exact catalog role and piping preparation/installation units support metallic construction pipefitting. Record the metallic limitation; do not generalize to every pipe material or licensed system.'
    if t=='Plumber':
        return (M,'NC III includes centralized systems, pumps and overseeing plumbing works. The source does not establish this level.') if c=='PLUMBING-NC-III' else (H,'The catalog names Plumber '+('I' if c=='PLUMBING-NC-I' else 'II')+' and core units train plumbing layout/joints/installation or testing/repair. This is a relevant level-specific trade pathway, not a guarantee of eligibility for every plumbing role.')
    if t=='Product Specialist':return H,'The retail TR explicitly lists Product Specialist and product presentation, selling and customer interaction duties match wholesale/retail work.'
    if t=='Professional Driver':return M,'Driving NC II is specifically light vehicles. The source does not identify vehicle class, which may require the bus/truck or articulated-vehicle qualification instead. A driving license is separate.'
    if t=='Quality Control Officer':return X,'IT-BPM quality control is not backstrap textile weaving quality control. The catalog title is identical but the core work is weaving, not service/software quality assurance.'
    if t in ['Refrigeration Technician','Refrigeration Technician/Mechanic']:return M,'Confirm commercial stationary, ice-plant or land-transport refrigeration system and responsibility level. '+q['name']+' is a specialized system scope, not every refrigeration job in '+s+'.'
    if t=='Rigger':
        return (X,'Construction rigging involves lifting gears and crane operations. This qualification rigs digital characters/game assets; the shared Rigger title is a different occupation.') if c=='3D-GAME-ART-DEVELOPMENT-NC-III' else (H,'The TR explicitly names construction Rigger and covers inspecting/installing rigging gears and assisting crane operators. Sector, occupation and core tasks align.')
    if t=='Room Attendant':return H,'Room/cabin attendant roles and cleaning/preparing guest rooms are explicit housekeeping scope, consistent with accommodation work.'
    if t=='Scaffolder':return H,'Scaffolder is an explicit catalog role and erecting/dismantling supported scaffolds matches construction work. Limit this relationship to supported-type scaffold.'
    if t=='Security Guard':return H,'The TR/catalog explicitly lists Security Guard and access control, monitoring and emergency response units support guarding. Verify separate licensing/employer requirements; the relationship is training relevance, not a license assertion.'
    if t=='Service Crew':return M,'Customer Services NC II explicitly includes service crew and fast-food outlets, so the relationship is plausible. Its core scope is retail sales/register/customer service and food merchandising, not full kitchen production; confirm counter/customer-service duties.'
    if t=='Software Developer':return M,'Confirm language/platform and scope. '+q['name']+' teaches a particular Java, .NET or web-development stack; generic Software Developer does not establish which one.'
    if t=='Structural Steel Erector':return H,'The exact catalog role and positioning, fitting-up and tack-welding structural members align with construction steel erection.'
    if t in ['TESDA Cookery Trainer','TESDA Housekeeping Trainer','TESDA Trainer']:
        if c=='TRAINERS-METHODOLOGY-LEVEL-I-2':return H,'The explicit TVET trainer/technical trainer role and lesson planning, learning facilitation and assessment units support the trainer-methodology component. Domain qualification, experience and any required trainer credentials remain separate.'
        return M,'The trade qualification supplies subject-matter skills, not teaching/assessment competence by itself. Validate the combined domain qualification and trainer-methodology/credential requirements for this trainer role.'
    if t=='Tile Setter':return H,'The exact catalog occupation and laying/repairing tiles align with construction tile-setting duties.'
    if t=='Transmission Lineman':
        return (H,'The explicit Transmission Lineman role and transmission inspection, ground/overhead maintenance units match the named utility specialization.') if c=='TLIM-NC-II' else (M,'NC III includes new line structures and emergency restoration/advanced overhead work. Confirm senior/responsibility level before selecting it for a generic lineman title.')
    if t=='Warehouse Supervisor':return H,'The exact catalog role and supervising teams, facilities and operations match the supervisor title and transportation/storage sector.'
    if t in ['Web Designer','Web Developer']:return H,'The catalog explicitly lists web designer or front/back/full-stack developer roles. Responsive design, interactive websites and backend development units support this portable ICT function even when the employer is hospitality or retail.'
    if t=='Wheelchair Technician':return H,'The exact wheelchair specialization aligns with assembly, modifications, checkout support and maintenance/repair units. It is a technical support role, not an independent rehabilitation-clinician credential.'
    if t=='Mason':
        return (H,'Rough masonry, hollow-block laying and plastering align with construction Mason.') if c=='MASONRY-NC-II' else (M,'The proposed '+q['name']+' covers helper-level preparation or finishing specialization. Confirm the actual grade and tasks rather than transferring generic mason demand to every level.')
    if t=='Field Customer Expert':return M,'The Pasay posting gives education and driving-license requirements but no product-selling/register duties. Retail employer context alone is insufficient to establish the Customer Services qualification scope.'
    if t=='Counter Bagger':return H,'Counter-Checker/Bagger is an explicit retail TR job. The named counter-bagging role and retail employer provide a strong relationship; no vacancy quantity or current-open status is inferred.'
    if t=='Administrative Aide III (Driver I)':return M,'The posting confirms a professional driver license but does not identify the vehicle class. Driving NC II is light vehicles; verify duties/class and civil-service eligibility separately.'
    if t=='Administrative Aide V (Photographer I)':return H,'The explicit Photographer specialization aligns with camera operation, lighting, post-capture processing and finished-image production in the Photography TR. Civil-service appointment requirements remain separate.'
    raise ValueError('Unreviewed candidate: '+repr((t,c,s)))

# Direct-PDF scope extraction, deliberately excluding tables of contents and unrelated backmatter.
retrieval=json.loads((R/'evidence/pdf-retrieval-log.json').read_text(encoding='utf-8'))
tr={}
for item in retrieval:
    if item.get('status')!=200 or 'sha256' not in item:continue
    code=item['qualification_code'];pages=json.loads((R/'raw'/(code+'-pages.json')).read_text(encoding='utf-8'))
    start=next((i for i,p in enumerate(pages[:16]) if re.search(r'SECTION\s*1|Section\s*1|SECTION\s*I\b',p['text']) and 'TABLE OF CONTENTS' not in p['text'].upper() and (('consist' in p['text'].lower() or 'covers' in p['text'].lower()) or 'qualificat' in p['text'].lower() and 'competent to be' in p['text'].lower())),None)
    if start is None:continue
    selected=[pages[start]]
    if 'competent to be' not in pages[start]['text'].lower() and start+1<len(pages) and not re.search(r'SECTION\s*2',pages[start+1]['text']):selected.append(pages[start+1])
    text='\n'.join(p['text'] for p in selected)
    tr[code]={**item,'scope_pages':[p['page_pdf'] for p in selected],'scope_text':text,'reference':'Section 1, PDF page(s) '+','.join(str(p['page_pdf']) for p in selected)}
scope_summaries={'RIGGING-NC-I': 'Construction lifting support: rigging-gear inspection and setup, plus crane-operator assistance.', '3D-GAME-ART-DEVELOPMENT-NC-III': 'Creation of digital game artwork, models, textures and character-animation rigs.', 'CAD-CAM-OPERATION-NC-III': 'Workshop-based computer-aided drafting and manufacturing programming; construction drafting alone may not cover its CAM scope.', 'CUSTOMER-SERVICES-NC-II': 'Retail/fast-food selling, customer assistance, checkout and stock work; the two merchandising units are electives.', 'AUTOMOTIVE-SERVICING-NC-I': 'Routine vehicle inspections and preventive work on engines, drivetrains, brakes, steering and suspension; not general plant maintenance.', 'MOLD-MAKING-NC-III': 'Producing, finishing, fitting and assembling mold components; CNC job titles occur within this mold-making scope.', 'CONTACT-CENTER-SERVICES-NC-II': 'Entry-level contact-center customer assistance, inquiries, complaints, selling, technical support and helpdesk service.', 'SECURITY-SERVICES-NC-I': 'Guarding support including access checks, workplace communications, emergencies and defensive/security tasks; licensing is a separate matter.', 'EIM-NC-II': 'Building electrical installation and upkeep within the stated 600-volt ceiling; not universal high-voltage or automotive coverage.', 'FOOD-PRODUCTION-NC-III': 'Supervising kitchen production, specialized cooking, catering planning and operational controls; not an assumed grade for every cook.', 'HOUSEKEEPING-NC-IV': 'Management of housekeeping/laundry personnel and associated supplies and services. The retrieved public copy is marked DRAFT.', 'TOUR-GUIDING-SERVICES-NC-III': 'Regional-tour destination research, trip arrangements and visitor escort/guiding; not an assertion of every tour-guide accreditation.', 'BARTENDING-NC-II': 'Bar preparation and operation, mixed beverages and basic wine service; separate from specialist coffee-shop work.', 'WAREHOUSING-SERVICES-NC-II': 'Receipt, storage, picking, packing and dispatch of goods, with manual equipment use in warehouses.', 'VISUAL-GRAPHIC-DESIGN-NC-III': 'Visual communication design for identity, print, interfaces, packaging and displays; includes artist/designer roles absent from the catalog job list.', 'PHOTOGRAPHY-NC-II': 'Camera composition, lighting, image processing and final photographic presentation support the photographer role.'}
for code,item in tr.items():item['scope_summary']=scope_summaries[code]
(R/'evidence/tr-scope-index.json').write_text(json.dumps(tr,ensure_ascii=False,indent=2),encoding='utf-8')

candidates=[]
for name,cohort in [('forecast_mapping_proposals.csv','national_2025_2026_forecast'),('observed_mapping_proposals.csv','observed_2026_pasay_posting')]:
    for rownum,r in enumerate(read(P/name),2):
        r=dict(r);r['candidate_input_file']=name;r['candidate_input_row']=rownum;r['cohort']=cohort;candidates.append(r)
assert len(candidates)==236

def enrich(r,decision,reason,candidate_id):
    q=bycode[r['qualification_code']];isforecast=r['cohort']=='national_2025_2026_forecast';src=fidx[key(r)] if isforecast else obsidx[r['record_id']]
    t=tr.get(q['code']);core=[x['name'] for x in q['competencies'] if x['category'].lower()=='core']
    jobs=q['possible_jobs'];exact=r['occupation_title_as_printed'].casefold() in [j.casefold() for j in jobs]
    return dict(r,mapping_review_id=candidate_id,sector_as_printed=r.get('sector_as_printed','not_classified_in_posting'),classification=r.get('classification','not_a_forecast_classification'),source_occurrence_key=occurrence(src),source_id=src['source_id'],source_url=src['source_url'],source_reference=(src['source_table']+'; PDF p.'+src['page_pdf']+'; printed p.'+src['page_printed']) if isforecast else src['document_reference'],source_period=src['period_label'] if isforecast else src['source_date'],source_page_printed=src.get('page_printed',''),source_table=src.get('source_table',''),source_pdf_sha256=src.get('pdf_sha256',''),source_verification=src.get('source_verification',''),evidence_class='official_2025_2026_national_forecast' if isforecast else 'observed_2026_posting_not_demand_forecast',geographic_scope='national' if isforecast else 'NCR_Pasay_posting',work_region=src.get('work_region','national_not_region_disaggregated'),occupation_title_as_printed=r['occupation_title_as_printed'],qualification_name=q['name'],qualification_sector=q['sector'],qualification_catalog_source=json.dumps(q['source'],ensure_ascii=False),catalog_download_id=q['source'].get('download_id',''),catalog_jobs_as_listed=json.dumps(jobs,ensure_ascii=False),relevant_core_competencies=json.dumps(core,ensure_ascii=False),exact_catalog_job_title=str(exact).lower(),occupation_duties_available='not supplied in national forecast; role inferred only from exact title and sector' if isforecast else 'limited listing requirements; no comprehensive job description',qualification_scope_evidence=t['scope_summary'] if t else 'Catalog occupation list and Core competencies; independent full TR not retrieved for this qualification in this audit',training_regulation_url=t['final_url'] if t else q['source']['list'],training_regulation_reference=t['reference'] if t else 'Catalog source download_id '+str(q['source'].get('download_id',''))+'; public TR index; full document not independently retrieved',training_regulation_sha256=t['sha256'] if t else '',evidence_tier=('official_hosted_draft_marked_PDF_and_catalog' if 'DRAFT' in t['scope_text'] else 'official_TR_PDF_and_catalog') if t else 'catalog_derived_scope_only',tr_revision_status='Public copy as printed; not independently certified latest revision' if t else 'Not independently retrieved',catalog_data_caution=('Published electives are included among catalog Core units; refer to TR Core/Electives distinction' if q['code']=='CUSTOMER-SERVICES-NC-II' else 'Catalog includes a stray TR header as a job; do not map that header' if q['code']=='RIGGING-NC-I' else 'Catalog job list omits the detailed artist/designer roles in the retrieved TR' if q['code']=='VISUAL-GRAPHIC-DESIGN-NC-III' else ''),confidence_assessment=decision,review_status=decision,review_reason=reason,formal_approval_status='pending_user_review',user_review_decision='',user_review_notes='',user_reviewed_on='',approved_for_integration='false',review_method='explicit occupational scope review; no embedding/similarity threshold',reviewed_on='2026-11-05')
reviewed=[enrich(r,*decide(r),f'PH4-C{i:03}') for i,r in enumerate(candidates,1)]
write('reviewed_original_236_mappings.csv',reviewed)
# Make a compact decision view for readers without duplicating embedded evidence paragraphs.
write('mapping_decisions_compact.csv',[{k:r[k] for k in ['mapping_review_id','cohort','record_id','source_occurrence_key','occupation_title_as_printed','sector_as_printed','classification','source_period','source_url','source_reference','qualification_code','qualification_name','confidence_assessment','review_reason','evidence_tier','training_regulation_url','training_regulation_reference','formal_approval_status','approved_for_integration']} for r in reviewed])

# Additional candidates are explicit title/scope proposals; no fuzzy-matching expansion.
extra_specs=[
('Website Developer','WEB-DEVELOPMENT-NC-III',H,'Website Developer is a direct web-development synonym; responsive/interactive websites and backend core units support this function.'),
('Graphic Designer','VISUAL-GRAPHIC-DESIGN-NC-III',H,'The retrieved TR explicitly names visual graphic artist/designer and covers logos, print, UI/UX and packaging. Graphic design is a portable function across employer industries.'),
('Graphic Artist','VISUAL-GRAPHIC-DESIGN-NC-III',H,'The retrieved TR explicitly lists visual graphic artist/designer and provides corresponding visual design competencies.'),
('Medical Coder','MEDICAL-CODING-CLAIMS-PROCESSING-NC-III',H,'Medical/Clinical Coding Specialist is an explicit catalog role; clinical coding and claims competencies support the named medical-coding function.'),
('Orthotics Technician','ARTS-NC-II',H,'The catalog explicitly names Orthotic Technician and the orthotics qualification matches this assistive-device specialization. It is not a clinician qualification.'),
('Prosthetics Technician','ARTS-NC-II-2',H,'The catalog explicitly names Prosthetic Technician and its prosthetics-specific support scope matches the named technical occupation.'),
('Bartender','BARTENDING-NC-II',H,'The retrieved TR explicitly lists Bartender/Barkeeper and bar operation, mixed drinks and wine-service competencies.'),
('Waiter/Waitress','FBS-NC-II',H,'Waiter/Waitress are gendered names for the same food-and-beverage service occupation; the catalog names Waiter and core units train guest dining service.'),
('Food Attendant','FBS-NC-II',M,'Food Attendant may describe dining service, counter service or production support. Confirm guest-service duties before selecting FBS.'),
('Front Desk Staff','FRONT-OFFICE-SERVICES-NC-II',H,'Accommodation front-desk staff aligns with Front Office Agent, reservation/reception and guest-account service competencies. This is not a front-office supervisory role.'),
('Reservations Officer','FRONT-OFFICE-SERVICES-NC-II',M,'Reservation work is relevant to front-office competencies, but confirm hotel guest-reservation duties versus airline/tour reservations.'),
('Tour Guide','TOUR-GUIDING-SERVICES-NC-III',H,'The retrieved TR explicitly names Regional Tour Guide and destination research, regional arrangements and guiding/escorting duties. Restrict the proposal to regional tour guiding.'),
('Scaffolding Installer','SCAFFOLDING-WORKS-NC-II',H,'Installing scaffolding is consistent with supported-type erection/dismantling and the Scaffolder catalog role. Retain the supported-type scope limitation.'),
('Rebar Worker','REINFORCING-STEEL-WORKS-NC-II',H,'Rebar Worker/Reinforcing Steel Worker is explicitly listed; reinforcing-steel fabrication and installation align with construction rebar work.'),
('Warehouse Personnel','WAREHOUSING-SERVICES-NC-II',H,'Warehouseperson is explicitly listed in the TR; receiving, storage, picking, dispatch and packing duties align with warehouse personnel.'),
('Logistics and Supply Chain Supervisor','WAREHOUSING-SERVICES-NC-IV',M,'The catalog lists Logistics/Supply Chain Supervisor, but the qualification core scope is warehouse supervision. Confirm that this broader logistics role includes warehouse operations.'),
('Bus Driver','DRIVING-NC-III-2',H,'Passenger Bus Driver is an exact vehicle-class role in the catalog; the source explicitly identifies bus rather than generic driving.'),
('Professional Driver (TNVS/Taxi)','DRIVING-NC-II',H,'The named taxi/TNVS vehicle function aligns with light-vehicle driving competencies. External license/accreditation requirements remain separate.'),
('Professional Driver (Truck/Bus)','DRIVING-NC-III-2',M,'The source groups truck and bus without distinguishing straight versus articulated trucks. This qualification covers passenger bus/straight truck; confirm vehicle type.'),
('Professional Driver (Truck/Bus)','DRIVING-NC-III',M,'This qualification covers articulated vehicles, only one possible branch of the grouped Truck/Bus source title. Confirm vehicle type; do not split the original source label.'),
('Delivery Driver','DRIVING-NC-II',M,'The delivery role does not establish light versus heavy vehicle class; confirm work vehicle and license requirements.'),
('Automotive Maintenance Technician','AUTOMOTIVE-SERVICING-NC-I',H,'The source specifies automotive maintenance. The retrieved TR trains periodic maintenance of automotive engine, drivetrain, brakes, steering and suspension.'),
('Automotive Electrician','AUTOMOTIVE-SERVICING-NC-II-2',H,'The source specifies automotive electrical work and the catalog covers Automotive Electrical Technician, ignition/starting/charging/body electrical diagnosis and repair.'),
('Heavy Equipment Mechanic','HEAVY-EQUIPMENT-SERVICING-NC-II',H,'The catalog explicitly names Heavy Equipment Mechanic and the qualification scope is mechanical servicing of heavy equipment. This is not equipment operation.'),
('CNC Operator','CNC-MILLING-MACHINE-OPERATION-NC-II',M,'The source does not identify milling versus turning/other CNC machines. Confirm machine and basic/advanced tasks before proposing CNC milling.'),
('CNC Machine Operator','CNC-MILLING-MACHINE-OPERATION-NC-II',M,'The source names CNC but not milling specifically; this is a possible specialized pathway pending machine confirmation.'),
('Technical Support Representative','CONTACT-CENTER-SERVICES-NC-II',H,'The retrieved contact-center TR explicitly includes inbound Technical Support in the IT-BPM service context. This is entry contact-center support, not all hardware/engineering technical support.'),
('IT Service Desk Analyst','CONTACT-CENTER-SERVICES-NC-II',M,'The TR includes entry-level IT Helpdesk, but analyst tasks may require broader technical administration. Confirm contact-center scope and level.'),
('Illustrator','ILLUSTRATION-NC-II',H,'The catalog explicitly lists book/magazine illustrator, comics artist and cartoonist, with illustration-production competencies. This is an illustration pathway, not every digital-art specialization.'),
('Motion Graphic Artist','2D-ANIMATION-NC-III',H,'Motion graphics animator is explicitly listed in the catalog, with digital/tradigital animation and video export competencies in IT-BPM.'),
('Microfinance Officer','MICROFINANCE-TECHNOLOGY-NC-II',H,'The catalog lists microfinance loan/project/account/socio-economic officers; microfinance operation competencies match the source financial-services specialization.'),
('Sales Associate','CUSTOMER-SERVICES-NC-II',H,'Retail Sales Associate is a direct synonym of the TR Sales Clerk/Sales Assistant role, supported by product selling and customer interaction.'),
('Bagger','CUSTOMER-SERVICES-NC-II',H,'The retail TR explicitly lists Counter-Checker/Bagger, matching the source bagging role in wholesale/retail.'),
('Merchandiser','CUSTOMER-SERVICES-NC-II',H,'The retail TR explicitly lists Promo Merchandiser and provides display/stock/customer-service competencies; merchandising units marked elective must not be treated as mandatory Core.'),
]
existing={(key(r),r['qualification_code']) for r in candidates if r['cohort']=='national_2025_2026_forecast'}
extras=[]
for title,code,status,reason in extra_specs:
    assert code in bycode
    sources=[s for s in forecast if s['occupation_title_as_printed']==title];assert sources,title
    for src in sources:
        if (key(src),code) in existing:continue
        r={k:src[k] for k in ['record_id','occupation_title_as_printed','classification','sector_as_printed','page_pdf']}
        r.update(qualification_code=code,qualification_name=bycode[code]['name'],method='additional_explicit_scope_review',mapping_status='new_proposal_pending_review',cohort='national_2025_2026_forecast',candidate_input_file='verified_national_2025_2026_forecast.csv',candidate_input_row=forecast.index(src)+2)
        extras.append(enrich(r,status,reason,f'PH4-A{len(extras)+1:03}'))
write('additional_forecast_mapping_proposals.csv',extras)
allrows=reviewed+extras
write('reviewed_mapping_dataset.csv',allrows)
write('mapping_decisions_compact.csv',[{k:r[k] for k in ['mapping_review_id','cohort','record_id','source_occurrence_key','occupation_title_as_printed','sector_as_printed','classification','source_period','source_url','source_reference','qualification_code','qualification_name','confidence_assessment','review_reason','evidence_tier','training_regulation_url','training_regulation_reference','formal_approval_status','approved_for_integration']} for r in allrows])
# Inventory all forecast occurrences, with coverage separated from proposal acceptance.
coverage=[]
for src in forecast:
    linked=[r for r in allrows if r['cohort']=='national_2025_2026_forecast' and r['source_occurrence_key']==occurrence(src)]
    high=[r for r in linked if r['review_status']==H];manual=[r for r in linked if r['review_status']==M]
    if high:status='has_high_confidence_proposal'
    elif manual:status='manual_review_only'
    elif linked:status='rejected_candidates_only'
    else:status='no_mapping_candidate_identified'
    coverage.append(dict(src,source_occurrence_key=occurrence(src),coverage_status=status,high_confidence_pairs=len(high),manual_review_pairs=len(manual),rejected_pairs=sum(r['review_status']==X for r in linked),proposal_ids=';'.join(r['mapping_review_id'] for r in linked),coverage_note='No safe reviewed relationship identified in the current 319-entry catalog' if not linked else 'All proposals require user review; no automatic approval'))
write('forecast_occupation_coverage.csv',coverage)
write('unmatched_forecast_occupations.csv',[r for r in coverage if r['coverage_status'] in ['no_mapping_candidate_identified','rejected_candidates_only']])
write('forecast_occupations_without_high_confidence_mapping.csv',[r for r in coverage if not r['high_confidence_pairs']])
# Record original ID collisions without changing them.
ids=collections.Counter(x['record_id'] for x in forecast)
write('source_id_collision_audit.csv',[{k:r[k] for k in ['record_id','source_occurrence_key','occupation_title_as_printed','sector_as_printed','classification','page_pdf','source_order_in_cell']} for r in coverage if ids[r['record_id']]>1])
summary={
'original_candidates':len(reviewed),'original_decisions':dict(collections.Counter(r['review_status'] for r in reviewed)),
'original_forecast_decisions':dict(collections.Counter(r['review_status'] for r in reviewed if r['cohort']=='national_2025_2026_forecast')),
'original_observed_decisions':dict(collections.Counter(r['review_status'] for r in reviewed if r['cohort']=='observed_2026_pasay_posting')),
'additional_candidates':len(extras),'additional_decisions':dict(collections.Counter(r['review_status'] for r in extras)),
'all_reviewed_pairs':len(allrows),'all_decisions':dict(collections.Counter(r['review_status'] for r in allrows)),
'forecast_occurrences':len(forecast),'forecast_unique_titles_case_insensitive':len({r['occupation_title_as_printed'].casefold() for r in forecast}),
'forecast_coverage_occurrences':dict(collections.Counter(r['coverage_status'] for r in coverage)),
'forecast_titles_with_any_high_proposal':len({r['occupation_title_as_printed'].casefold() for r in coverage if r['high_confidence_pairs']}),
'unmatched_occurrences':sum(r['coverage_status'] in ['no_mapping_candidate_identified','rejected_candidates_only'] for r in coverage),
'unmatched_distinct_titles_case_insensitive':len({r['occupation_title_as_printed'].casefold() for r in coverage if r['coverage_status'] in ['no_mapping_candidate_identified','rejected_candidates_only']}),
'original_record_id_unique_count':len(ids),'original_record_ids_with_collisions':sum(n>1 for n in ids.values()),
'retrieved_official_pdfs':sum('sha256' in x for x in retrieval),'extracted_tr_scopes':len(tr),
'original_pair_evidence_tiers':dict(collections.Counter(r['evidence_tier'] for r in reviewed)),
'high_proposal_evidence_tiers':dict(collections.Counter(r['evidence_tier'] for r in allrows if r['review_status']==H)),
'approved_pairs':0}
(R/'datasets/summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))

# A title-wide view excludes a label if another sector has any non-rejected proposal.
nonrejected_titles={r['occupation_title_as_printed'].casefold() for r in coverage if r['high_confidence_pairs'] or r['manual_review_pairs']}
groups=collections.defaultdict(list)
for r in coverage:
    if r['occupation_title_as_printed'].casefold() not in nonrejected_titles:groups[r['occupation_title_as_printed'].casefold()].append(r)
write('unmatched_titles_all_sectors.csv',[dict(occupation_title_as_printed=g[0]['occupation_title_as_printed'],exact_title_labels=json.dumps(list(dict.fromkeys(r['occupation_title_as_printed'] for r in g)),ensure_ascii=False),sectors=json.dumps(list(dict.fromkeys(r['sector_as_printed'] for r in g)),ensure_ascii=False),forecast_classifications=json.dumps(list(dict.fromkeys(r['classification'] for r in g))),source_occurrence_keys=';'.join(r['source_occurrence_key'] for r in g),source_references=';'.join(r['source_table']+' PDF p.'+r['page_pdf'] for r in g),reason='No non-rejected reviewed proposal for this title in any sector; not proof that no TESDA qualification could ever be relevant') for g in groups.values()])
summary['fully_unmatched_distinct_titles_all_sectors']=len(groups)
summary['unmatched_distinct_titles_in_unmatched_occurrences']=summary.pop('unmatched_distinct_titles_case_insensitive')
(R/'datasets/summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
# Official document register, including publicly hosted draft warnings and exact retrieved hashes.
write('training_regulation_sources.csv',[dict(qualification_code=c,source_url=t['final_url'],requested_url=t['requested_url'],retrieved_utc=t['retrieved_utc'],sha256=t['sha256'],pdf_pages=t['pages'],scope_reference=t['reference'],scope_summary=t['scope_summary'],document_warning='DRAFT appears on scope pages; corroborative only, not finalized authority' if 'DRAFT' in t['scope_text'] else 'Latest operative revision not independently certified',local_pdf='raw/'+c+'.pdf',scope_pages_json='raw/'+c+'-pages.json') for c,t in tr.items()])

write('high_confidence_national_forecast_proposals.csv',[r for r in allrows if r['cohort']=='national_2025_2026_forecast' and r['review_status']==H])
write('high_confidence_observed_posting_proposals.csv',[r for r in allrows if r['cohort']=='observed_2026_pasay_posting' and r['review_status']==H])
write('needs_manual_review.csv',[r for r in allrows if r['review_status']==M])
write('rejected_proposals.csv',[r for r in allrows if r['review_status']==X])
