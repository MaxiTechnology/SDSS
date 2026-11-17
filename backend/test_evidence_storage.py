import os
from uuid import uuid4
from hashlib import sha256
import pytest
from psycopg import sql
from fastapi.testclient import TestClient
import database,evidence
from app import app


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_cloud_evidence_review_versions_downloads_and_history(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as c:c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        c=original();c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return c
    monkeypatch.setattr(database,'connect',isolated);client=TestClient(app)
    def req(method,path,data=None,status=200):
        r=client.request(method,path,json=data);assert r.status_code==status,(path,r.text);return None if status==204 else r.json()
    try:
        with isolated() as c:database.migrate(c);database.migrate(c)
        pid=str(uuid4());base='/api/projects/'+pid
        req('POST','/api/projects',{'id':pid,'name':'Synthetic evidence test','currency':'USD'},201)
        suppliers=[req('POST',base+'/suppliers',{'id':str(uuid4()),'name':name},201) for name in ['Alpha','Beta']]
        req('PUT',base+'/criteria',{'criteria':[{'id':cid,'name':cid,'unit':'units','direction':direction} for cid,direction in [('price','cost'),('quality','benefit')]],'mandatory_checks':[{'id':'cert','name':'Certificate','requirement':'Synthetic demonstration evidence'}],'expected_revision':0})
        req('PUT',base+'/weights/manual',{'weights':{'price':'50','quality':'50'},'approved':True,'criteria_revision':1,'expected_revision':0})
        for s in suppliers:req('PUT',base+'/eligibility/'+s['id'],{'checks':{'cert':{'status':'passed','notes':'Synthetic manual review'}},'currency':'USD','criteria_revision':1,'supplier_updated_at':s['updated_at'],'expected_revision':0})
        s=suppliers[0];files=base+'/suppliers/'+s['id']+'/evidence';docid=str(uuid4());url=files+'/'+docid
        params={'filename':'sample.txt','criteria_revision':1,'supplier_updated_at':s['updated_at'],'evidence_revision':0,'check_id':'cert'};content=b'SYNTHETIC evidence - academic demonstration only\n'
        matrix=req('GET',base+'/matrix');entries={s['id']:{'price':str(100+i*20),'quality':str(95-i*5)} for i,s in enumerate(suppliers)}
        req('PUT',base+'/matrix',{'context':matrix['context'],'expected_revision':0,'entries':entries})
        run=req('POST',base+'/rankings',{'context':matrix['context'],'matrix_revision':1})
        decision=req('POST',base+'/decisions',{'id':str(uuid4()),'ranking_id':run['id'],'expected_version':0,'action':'approve','supplier_id':s['id'],'confirmed':True})
        reportpath=base+'/decisions/'+decision['id']+'/report';report=req('GET',reportpath)
        uploaded=client.put(url,params=params,content=content,headers={'content-type':'application/pdf'})
        assert uploaded.status_code==200,uploaded.text
        assert uploaded.json()['file']['sha256']==sha256(content).hexdigest() and uploaded.json()['evidence_revision']==1
        assert uploaded.json()['file']['mime_type'].startswith('text/plain')
        assert client.put(url,params=params,content=content).json()['evidence_revision']==1
        assert client.put(url,params=params,content=b'Changed content').status_code==409
        assert client.put(files+'/'+str(uuid4()),params=params,content=content).status_code==409
        assert client.put(files+'/'+str(uuid4()),params={**params,'evidence_revision':1,'filename':'bad.exe'},content=content).status_code==422
        assert client.put(files+'/'+str(uuid4()),params={**params,'evidence_revision':1},content=b'x'*(evidence.MAX_FILE_BYTES+1)).status_code==413
        assert client.put(files+'/'+str(uuid4()),params={**params,'evidence_revision':1,'check_id':'unknown'},content=content).status_code==422
        rows=req('GET',base+'/eligibility')['suppliers'];assert rows[0]['eligibility']=='pending' and rows[0]['needs_review']
        assert req('GET',base+'/rankings')['stale'] and req('GET',reportpath)==report
        download=client.get(url+'/content');assert download.content==content and download.headers['x-content-type-options']=='nosniff'
        assert 'attachment' in download.headers['content-disposition']
        assert client.get('/api/projects/'+str(uuid4())+'/suppliers/'+s['id']+'/evidence/'+docid+'/content').status_code==404
        review={'checks':{'cert':{'status':'passed','notes':'Synthetic manual review'}},'currency':'USD','criteria_revision':1,'supplier_updated_at':s['updated_at'],'expected_revision':1,'evidence_revision':0}
        req('PUT',base+'/eligibility/'+s['id'],review,409)
        reviewed=req('PUT',base+'/eligibility/'+s['id'],{**review,'evidence_revision':1});assert reviewed['evidence_files'][0]['id']==docid
        m=req('GET',base+'/matrix');req('PUT',base+'/matrix',{'context':m['context'],'expected_revision':1,'entries':entries})
        newrun=req('POST',base+'/rankings',{'context':m['context'],'matrix_revision':2})
        newdecision=req('POST',base+'/decisions',{'id':str(uuid4()),'ranking_id':newrun['id'],'expected_version':1,'action':'approve','supplier_id':s['id'],'confirmed':True,'revision_reason':'Evidence reviewed'})
        newpath=base+'/decisions/'+newdecision['id']+'/report';newreport=req('GET',newpath);assert newreport['evidence_files'][0]['sha256']==sha256(content).hexdigest()
        req('DELETE',url+'?evidence_revision=1');assert req('GET',files)['files']==[]
        assert req('GET',files)['limits']['used_bytes']==len(content)
        assert client.get(url+'/content').content==content and req('GET',newpath)==newreport
        assert req('DELETE',url+'?evidence_revision=1')['evidence_revision']==2
        again=req('PUT',base+'/eligibility/'+s['id'],{**review,'expected_revision':2,'evidence_revision':2});assert again['revision']==3
        req('DELETE',base+'/suppliers/'+s['id']+'?expected_updated_at='+s['updated_at'].replace('+','%2B'),status=204)
        assert client.get(url+'/content').content==content
        assert req('GET',newpath)==newreport
        monkeypatch.setattr(evidence,'MAX_PROJECT_BYTES',len(content)+1)
        other=suppliers[1]
        assert client.put(base+'/suppliers/'+other['id']+'/evidence/'+str(uuid4()),params={**params,'supplier_updated_at':other['updated_at'],'evidence_revision':0},content=b'abc').status_code==422
    finally:
        with original() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
