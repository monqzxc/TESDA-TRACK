"""Fetch only recorded public official URLs with robots/TLS checks; no form submissions."""
import json,time,hashlib,urllib.robotparser,datetime
from pathlib import Path
from urllib.parse import urlsplit,urljoin
import httpx,fitz
R=Path(__file__).resolve().parents[1];UA="TESDATrackMappingReview/0.1 (public qualification research; no training)"
log=[];robots={};last={}
def send(url):
    host=urlsplit(url).netloc;time.sleep(max(0,2-(time.monotonic()-last.get(host,0))))
    last[host]=time.monotonic();return httpx.get(url,headers={"User-Agent":UA},timeout=45,follow_redirects=False)
def allowed(url):
    origin="https://"+urlsplit(url).netloc
    if origin not in robots:
        r=send(origin+"/robots.txt");rp=urllib.robotparser.RobotFileParser()
        (R/"raw"/(urlsplit(url).netloc+"-robots.txt")).write_bytes(r.content)
        if r.status_code!=200:raise RuntimeError("Robots unavailable: "+str(r.status_code))
        rp.parse(r.text.splitlines());robots[origin]=rp
    if not robots[origin].can_fetch(UA,url):raise RuntimeError("Robots disallows URL")
for code,url in json.loads((R/"evidence/official-pdf-targets.json").read_text(encoding="utf-8")):
    target=R/"raw"/(code+".pdf")
    if target.exists():continue
    entry=dict(qualification_code=code,requested_url=url,retrieved_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    try:
        for hop in range(4):
            allowed(url);res=send(url)
            if res.status_code in (301,302,303,307,308):url=urljoin(url,res.headers["location"]);continue
            break
        entry.update(final_url=url,status=res.status_code)
        if res.status_code==200 and res.content.startswith(b"%PDF"):
            target.write_bytes(res.content);entry.update(sha256=hashlib.sha256(res.content).hexdigest(),bytes=len(res.content))
            doc=fitz.open(target);pages=[dict(page_pdf=i+1,text=p.get_text()) for i,p in enumerate(doc)]
            (R/"raw"/(code+"-pages.json")).write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding="utf-8")
            entry["pages"]=len(doc)
        else:entry["error"]="Not a publicly retrieved PDF; no form bypass attempted"
    except Exception as e:entry["error"]=str(e)
    log.append(entry)
    existing=R/"evidence/pdf-retrieval-log.json"
    old=json.loads(existing.read_text(encoding="utf-8")) if existing.exists() else []
    existing.write_text(json.dumps(old+[entry],indent=2),encoding="utf-8")
    print(code,entry.get("status"),entry.get("pages"),entry.get("error",""),flush=True)
