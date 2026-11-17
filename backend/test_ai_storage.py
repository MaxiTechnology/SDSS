import os
from uuid import uuid4
import pytest
from psycopg import sql
from fastapi.testclient import TestClient
import database,ai_weighting,cloudflare_ai
from app import app


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_ai_consent_generation_approval_provenance_and_conflicts(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as c:c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        c=original();c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return c
    monkeypatch.setattr(database,'connect',isolated)
    monkeypatch.setattr(cloudflare_ai,'settings',lambda:{'configured':'test'})
    mode={'value':'ok','calls':0}
    def generate(context,priorities):
        mode['calls']+=1
        assert set(context)=={'category','criteria'}
        if mode['value']=='fail':raise cloudflare_ai.AIConnectionError('Synthetic timeout; saved work was kept.')
        if mode['value']=='race':
            with isolated() as c:
                c.execute("SET LOCAL lock_timeout='2s'")
                c.execute("UPDATE purchasing_projects SET category='Changed during generation' WHERE id=%s",(pid,))
        return {'weights':{'price':'60.00','quality':'40.00'},'rationales':{'price':'Cost priority','quality':'Quality priority'},'summary':'Synthetic advisory suggestion'}
    monkeypatch.setattr(ai_weighting,'generate_suggestion',generate)
    client=TestClient(app)
    def req(method,path,body=None,status=200):
        r=client.request(method,path,json=body);assert r.status_code==status,(path,r.text);return r.json()
    try:
        with isolated() as c:database.migrate(c);database.migrate(c)
        pid=str(uuid4());base='/api/projects/'+pid;ai=base+'/weights/ai'
        req('POST','/api/projects',{'id':pid,'name':'Synthetic AI test','category':'IT','currency':'USD'},201)
        suppliers=[req('POST',base+'/suppliers',{'id':str(uuid4()),'name':n},201) for n in ['Alpha','Beta']]
        req('PUT',base+'/criteria',{'criteria':[{'id':cid,'name':cid,'unit':'units','direction':direction} for cid,direction in [('price','cost'),('quality','benefit')]],'expected_revision':0})
        manual={'weights':{'price':'50','quality':'50'},'criteria_revision':1,'expected_revision':0,'approved':True};req('PUT',base+'/weights/manual',manual)
        request={'id':str(uuid4()),'criteria_revision':1,'expected_revision':0,'priorities':'Balance cost and quality','consent':True}
        req('POST',ai+'/suggest',{**request,'consent':False},422);assert mode['calls']==0
        mode['value']='fail';req('POST',ai+'/suggest',request,503);assert req('GET',ai)['revision']==0
        assert req('GET',base+'/weights/manual')['approved']
        mode['value']='ok';draft=req('POST',ai+'/suggest',request);assert not draft['approved'] and draft['revision']==1
        calls=mode['calls'];assert req('POST',ai+'/suggest',request)['revision']==1 and mode['calls']==calls
        req('POST',ai+'/suggest',{**request,'priorities':'Changed content'},409)
        assert req('GET',base+'/weights/manual')['revision']==1
        approval={'suggestion_id':request['id'],'criteria_revision':1,'expected_revision':1,'expected_weight_revision':1,'weights':{'price':'55','quality':'45'},'notes':'Adjusted after human review','approved':True}
        approved=req('PUT',ai,approval);assert approved['approved'] and approved['weight_revision']==2
        assert req('PUT',ai,approval)['revision']==2
        assert req('GET',base+'/eligibility')['weight_method']=='ai'
        m=req('GET',base+'/matrix');entries={s['id']:{'price':str(100+i*20),'quality':str(95-i*10)} for i,s in enumerate(suppliers)}
        req('PUT',base+'/matrix',{'context':m['context'],'expected_revision':0,'entries':entries})
        r=req('POST',base+'/rankings',{'context':m['context'],'matrix_revision':1})
        d=req('POST',base+'/decisions',{'id':str(uuid4()),'ranking_id':r['id'],'expected_version':0,'action':'approve','supplier_id':suppliers[0]['id'],'confirmed':True})
        reportpath=base+'/decisions/'+d['id']+'/report';report=req('GET',reportpath)
        assert report['weight_method']=='AI-assisted weighting (approved)'
        assert report['ai_assistance']['weights']['price']=='60.00' and report['criteria'][0]['weight']=='55.00'
        with isolated() as c:c.execute("UPDATE purchasing_projects SET category='Other' WHERE id=%s",(pid,))
        req('GET',base+'/eligibility',status=422);assert req('GET',base+'/rankings')['stale']
        with isolated() as c:c.execute("UPDATE purchasing_projects SET category='IT' WHERE id=%s",(pid,))
        next_request={**request,'id':str(uuid4()),'expected_revision':2}
        next_draft=req('POST',ai+'/suggest',next_request);assert next_draft['revision']==3
        assert not req('GET',base+'/rankings')['stale'] # Generation does not replace active approved weights.
        req('PUT',base+'/weights/manual',{**manual,'expected_revision':2})
        edited={**approval,'suggestion_id':next_request['id'],'expected_revision':3,'expected_weight_revision':2}
        req('PUT',ai,edited,409)
        edited.update(expected_weight_revision=3,approved=False)
        req('PUT',ai,edited);assert req('GET',base+'/weights/manual')['approved']
        mode['value']='race'
        req('POST',ai+'/suggest',{**request,'id':str(uuid4()),'expected_revision':4},409)
        assert req('GET',ai)['revision']==4 and req('GET',ai)['needs_review']
        assert req('GET',reportpath)==report
        assert len(req('GET',ai+'/history')['versions'])==4
        req('PUT','/api/projects/'+str(uuid4())+'/weights/ai',edited,404)
    finally:
        with original() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
