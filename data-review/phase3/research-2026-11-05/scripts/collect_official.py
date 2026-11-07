"""Small, conservative public-source collector. No auth, TLS bypass or hidden endpoints.
Run with the project .venv Python. Writes a NEW capture directory each execution.
"""
import argparse, datetime, hashlib, json, time, urllib.robotparser
from pathlib import Path
from urllib.parse import urlsplit
import httpx
UA = "TESDATrackResearch/0.1 (official public research; no model training)"
class Collector:
    def __init__(self, out):
        self.out=Path(out); self.out.mkdir(parents=True, exist_ok=False)
        self.log=[]; self.robots={}; self.last={}; self.blocked=set()
    def request(self, name, url, body=None):
        origin="https://"+urlsplit(url).netloc
        if origin in self.blocked: raise RuntimeError("Origin blocked after security/access failure")
        if origin not in self.robots:
            r=self._send(origin+"/robots.txt")
            self.save(name+"_robots",origin+"/robots.txt",r)
            if r.status_code != 200: raise RuntimeError("Cannot establish robots permission")
            rp=urllib.robotparser.RobotFileParser();rp.parse(r.text.splitlines());self.robots[origin]=rp
        if not self.robots[origin].can_fetch(UA,url): raise RuntimeError("robots.txt disallows URL")
        r=self._send(url,body);self.save(name,url,r,body)
        if r.status_code in (401,403,429):self.blocked.add(origin)
        r.raise_for_status()
        if "application/json" in r.headers.get("content-type",""):return json.loads(r.content.decode("utf-8-sig"))
        return r.text
    def _send(self,url,body=None):
        host=urlsplit(url).netloc
        time.sleep(max(0,2-(time.monotonic()-self.last.get(host,0))))
        self.last[host]=time.monotonic()
        # Redirects require separate robots/terms verification; never follow automatically.
        return httpx.request("POST" if body is not None else "GET",url,json=body,
            headers={"User-Agent":UA},timeout=30,follow_redirects=False)
    def save(self,name,url,r,body=None):
        f=self.out/(name+".txt");f.write_bytes(r.content)
        self.log.append(dict(name=name,url=url,method="POST" if body is not None else "GET",
            status=r.status_code,content_type=r.headers.get("content-type"),bytes=len(r.content),
            sha256=hashlib.sha256(r.content).hexdigest(),retrieved_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            request_body=body,response_file=f.name))
        (self.out/"requests.json").write_text(json.dumps(self.log,indent=2),encoding="utf-8")
def main():
    a=argparse.ArgumentParser();a.add_argument("--out",required=True);a.add_argument("--mode",choices=["api","pasay"],default="api");args=a.parse_args()
    c=Collector(args.out)
    if args.mode=="pasay":
        c.request("pasay_jobs","https://pasay.gov.ph/job-openings/");return
    b="https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/"
    cat=c.request("shortage_catalog",b+"1B/ISLE/OSS/")
    for t in cat:
        if t["type"]=="t":
            m=c.request("shortage_"+t["id"],b+"1B/ISLE/OSS/"+t["id"])
    m=c.request("employment_metadata",b+"1B/LFS/0121B3FEMP4.px")
    # One published cell: August 2026 Total; resolve codes from metadata.
    q={"query":[],"response":{"format":"json"}}
    for v in m["variables"]:
        label="2026" if v["code"]=="Year" else "August" if v["code"]=="Month" else "Total"
        idx=next(i for i,t in enumerate(v["valueTexts"]) if t.casefold()==label.casefold())
        q["query"].append({"code":v["code"],"selection":{"filter":"item","values":[v["values"][idx]]}})
    c.request("employment_one_cell",b+"1B/LFS/0121B3FEMP4.px",q)
    # Test the documented PSOC group once, without credentials; do not bypass denial.
    try:
        c.request("psoc_major_without_token","https://classification.psa.gov.ph/psoc/2012/major")
    except httpx.HTTPStatusError as e:
        if e.response.status_code != 400: raise
        print("PSOC token required; denial captured, no retry.")
if __name__=="__main__":main()
