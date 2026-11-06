"""Check audit completeness, source joins, approval gates, hashes and preserved project files."""
import csv,json,hashlib,collections,subprocess,ast
from pathlib import Path
R=Path(__file__).resolve().parents[1];ROOT=R.parents[1]
def read(p):
    with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
D=R/'datasets';P=ROOT/'data-review/phase3/research-2026-11-05/datasets'
original=read(D/'reviewed_original_236_mappings.csv');allrows=read(D/'reviewed_mapping_dataset.csv');extra=read(D/'additional_forecast_mapping_proposals.csv')
assert len(original)==236 and len(extra)==39 and len(allrows)==275
assert len({r['mapping_review_id'] for r in allrows})==len(allrows)
codes={q['code'] for q in json.loads((R/'evidence/catalog-snapshot.json').read_text(encoding='utf-8'))}
assert all(r['qualification_code'] in codes and r['formal_approval_status']=='pending_user_review' and r['approved_for_integration']=='false' for r in allrows)
assert all(r['review_status'] in ['High-confidence proposal','Needs manual review','Rejected proposal'] and r['review_reason'] and r['relevant_core_competencies'] and r['training_regulation_reference'] and r['source_reference'] for r in allrows)
input_rows=[]
for file in ['forecast_mapping_proposals.csv','observed_mapping_proposals.csv']:
    for i,r in enumerate(read(P/file),2):input_rows.append((file,i,r))
for out,(file,i,inp) in zip(original,input_rows):
    assert out['candidate_input_file']==file and int(out['candidate_input_row'])==i
    for k in ['record_id','occupation_title_as_printed','qualification_code']:
        assert out[k]==inp[k],(k,out['mapping_review_id'])
    for k in ['sector_as_printed','classification','page_pdf']:
        if k in inp:assert out[k]==inp[k]
cover=read(D/'forecast_occupation_coverage.csv');assert len(cover)==442 and len({r['source_occurrence_key'] for r in cover})==442
assert sum(r['classification']=='in_demand' for r in cover)==354 and sum(r['classification']=='hard_to_fill' for r in cover)==88
lookup={r['source_occurrence_key']:r for r in cover}
for r in allrows:
    if r['cohort']=='national_2025_2026_forecast':
        src=lookup[r['source_occurrence_key']]
        assert all(src[k]==r[k] for k in ['occupation_title_as_printed','sector_as_printed','classification','record_id'])
    else:assert r['classification']=='not_a_forecast_classification'
high=read(D/'high_confidence_national_forecast_proposals.csv');assert len(high)==80 and all(r['cohort']=='national_2025_2026_forecast' for r in high)
assert len(read(D/'high_confidence_observed_posting_proposals.csv'))==2
manifest=[]
for f in sorted((R/'raw').glob('*')):
    if f.is_file():manifest.append(dict(path=str(f.relative_to(R)),bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest()))
(R/'evidence/raw-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
for doc in json.loads((R/'evidence/pdf-retrieval-log.json').read_text(encoding='utf-8')):
    if 'sha256' in doc:assert hashlib.sha256((R/'raw'/(doc['qualification_code']+'.pdf')).read_bytes()).hexdigest()==doc['sha256']
for f in (R/'scripts').glob('*.py'):ast.parse(f.read_text(encoding='utf-8'))
before=json.loads((R/'evidence/preservation-before.json').read_text(encoding='utf-8'))
changed=[f for f,h in before['files'].items() if not (ROOT/f).exists() or hashlib.sha256((ROOT/f).read_bytes()).hexdigest()!=h]
assert not changed,changed
assert subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()=='zyre-updates'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==before['head']
result=dict(status='passed',original_candidates_checked=236,total_proposals_checked=275,source_occurrences_checked=442,protected_files_checked=len(before['files']),changed_protected_files=changed,approved_for_integration=0,checks='Every input pair reviewed exactly once; original labels/sector/classifications preserved; source joins unique; catalog codes valid; forecast/posting cohorts separated; all decisions reasoned; formal approval blocked; raw PDF hashes verified; existing files and HEAD unchanged')
(R/'evidence/validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
