import os
from uuid import uuid4
from fastapi.testclient import TestClient
from psycopg import sql
import pytest
import database
from app import app


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_ahp_approval_history_and_downstream_provenance(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as c:c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        c=original();c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return c
    monkeypatch.setattr(database,'connect',isolated);client=TestClient(app)
    def req(method,path,data=None,status=200):
        r=client.request(method,path,json=data);assert r.status_code==status,(path,r.text);return r.json()
    try:
        with isolated() as c:database.migrate(c);database.migrate(c)
        pid=str(uuid4());base='/api/projects/'+pid
        req('POST','/api/projects',{'id':pid,'name':'Synthetic AHP check','currency':'USD'},201)
        suppliers=[req('POST',base+'/suppliers',{'id':str(uuid4()),'name':n},201) for n in ['Alpha','Beta']]
        config={'criteria':[{'id':cid,'name':cid,'unit':'units','direction':direction} for cid,direction in [('price','cost'),('quality','benefit'),('delivery','cost')]],'expected_revision':0}
        req('PUT',base+'/criteria',config)
        manual={'weights':{'price':'40','quality':'40','delivery':'20'},'approved':True,'criteria_revision':1,'expected_revision':0}
        req('PUT',base+'/weights/manual',manual)
        ahp=base+'/weights/ahp';initial=req('GET',ahp)
        assert initial['active_method']=='manual' and not initial['approved']
        payload={'judgments':initial['judgments'],'criteria_revision':1,'expected_revision':0,'expected_weight_revision':1,'approved':False}
        draft=req('PUT',ahp,payload);assert draft['revision']==1
        assert req('GET',base+'/weights/manual')['approved']
        assert req('PUT',ahp,payload)['revision']==1
        inconsistent={'price:quality':'9','price:delivery':'1/9','quality:delivery':'9'}
        bad={**payload,'judgments':inconsistent,'expected_revision':1,'approved':True}
        assert not req('POST',ahp+'/calculate',bad)['acceptable']
        req('PUT',ahp,bad,422)
        judgments={'price:quality':'2','price:delivery':'4','quality:delivery':'2'}
        approval={**bad,'judgments':judgments}
        approved=req('PUT',ahp,approval);assert approved['approved'] and approved['weight_revision']==2
        assert req('PUT',ahp,approval)['revision']==2
        active=req('GET',base+'/weights/manual');assert active['method']=='ahp' and not active['approved']
        assert req('GET',base+'/eligibility')['weight_method']=='ahp'
        m=req('GET',base+'/matrix')
        entries={s['id']:{'price':str(100+i*10),'quality':str(95-i*5),'delivery':str(5+i*3)} for i,s in enumerate(suppliers)}
        req('PUT',base+'/matrix',{'context':m['context'],'expected_revision':0,'entries':entries})
        r=req('POST',base+'/rankings',{'context':m['context'],'matrix_revision':1})
        d=req('POST',base+'/decisions',{'id':str(uuid4()),'ranking_id':r['id'],'expected_version':0,'action':'approve','supplier_id':suppliers[0]['id'],'confirmed':True})
        path=base+'/decisions/'+d['id']+'/report';report=req('GET',path)
        assert 'AHP' in report['weight_method'] and report['weight_diagnostics']['acceptable']
        edited={**approval,'judgments':{**judgments,'price:quality':None},'expected_revision':2,'expected_weight_revision':2,'approved':False}
        req('PUT',ahp,edited);req('GET',base+'/eligibility',status=422)
        assert req('GET',base+'/rankings')['stale']
        assert req('GET',path)==report
        history=req('GET',ahp+'/history')['versions'];assert len(history)==3
        assert history[1]['snapshot']['approved'] and history[1]['snapshot']['judgments']==judgments
        req('PUT',ahp,{**approval,'expected_revision':2},409)
        req('PUT',base+'/weights/manual',{**manual,'expected_revision':3})
        assert req('GET',base+'/weights/manual')['method']=='manual'
        assert not req('GET',ahp)['approved']
        req('GET','/api/projects/'+str(uuid4())+'/weights/ahp',status=404)
        config['expected_revision']=1;config['criteria'][0]['name']='Changed price'
        req('PUT',base+'/criteria',config)
        assert req('GET',ahp)['needs_review'] and not any(req('GET',ahp)['judgments'].values())
    finally:
        with original() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
