import os
from uuid import uuid4
from io import BytesIO
import pytest
from psycopg import sql
from fastapi.testclient import TestClient
from pypdf import PdfReader
import database
from app import app,ScenarioSave
from reports import report_data,render_pdf


def test_saved_scenario_validation_and_report():
    from test_reports import saved
    for name in ['', '   ']:
        with pytest.raises(ValueError):ScenarioSave(id=uuid4(),baseline_id=uuid4(),weights={'x':'50','y':'50'},name=name)
    row=saved();original=report_data(row)['sensitivity']
    row['snapshot']['sensitivity_scenarios']=[{'name':'Cost first <test>','notes':'Synthetic scenario only','actor':'Demo User','created_at':'2026-11-18','weights':{'price':'90','quality':'10'},'result':{'rows':[{'id':'b','name':'Beta','rank':1,'score':'0.9'},{'id':'a','name':'Alpha','rank':2,'score':'0.1'}]}}]
    report=report_data(row);assert 'set changed' in report['sensitivity'] and '90%' in report['sensitivity']
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render_pdf(report))).pages)
    assert 'Cost first <test>' in text and 'Synthetic scenario only' in text and 'baseline rank 2, scenario rank 1' in text
    assert 'No sensitivity findings' in original


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_cloud_saved_scenarios_and_decision_snapshot(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as c:c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        c=original();c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return c
    monkeypatch.setattr(database,'connect',isolated)
    client=TestClient(app)
    def req(method,path,data=None,status=200):
        r=client.request(method,path,json=data);assert r.status_code==status,(path,r.text);return r.json()
    try:
        with isolated() as c:database.migrate(c);database.migrate(c)
        pid=str(uuid4());base='/api/projects/'+pid
        req('POST','/api/projects',{'id':pid,'name':'Synthetic saved scenarios','currency':'USD'},201)
        suppliers=[req('POST',base+'/suppliers',{'id':str(uuid4()),'name':n},201) for n in ['Alpha','Beta']]
        req('PUT',base+'/criteria',{'criteria':[{'id':cid,'name':cid,'unit':'units','direction':d} for cid,d in [('price','cost'),('quality','benefit')]],'expected_revision':0})
        req('PUT',base+'/weights/manual',{'weights':{'price':'50','quality':'50'},'approved':True,'criteria_revision':1,'expected_revision':0})
        m=req('GET',base+'/matrix');entries={s['id']:{'price':str(100+i*50),'quality':str(70+i*20)} for i,s in enumerate(suppliers)}
        req('PUT',base+'/matrix',{'context':m['context'],'expected_revision':0,'entries':entries})
        run=req('POST',base+'/rankings',{'context':m['context'],'matrix_revision':1})
        before=req('GET',base+'/weights/manual');preview={'baseline_id':run['id'],'weights':{'price':'90','quality':'10'}}
        simulation=req('POST',base+'/sensitivity',preview)
        payload={**preview,'id':str(uuid4()),'name':'Cost first','notes':'Synthetic priorities'}
        saved=req('POST',base+'/sensitivity/scenarios',payload)
        assert saved['result']==simulation['result']
        assert req('POST',base+'/sensitivity/scenarios',payload)==saved
        req('POST',base+'/sensitivity/scenarios',{**payload,'name':'Changed'},409)
        assert req('GET',base+'/sensitivity/scenarios?baseline_id='+run['id'])['scenarios']==[saved]
        assert req('GET',base+'/rankings')==run and req('GET',base+'/weights/manual')==before
        req('POST','/api/projects/'+str(uuid4())+'/sensitivity/scenarios',payload,404)
        chosen=run['snapshot']['result']['rows'][0]['id']
        decision=req('POST',base+'/decisions',{'id':str(uuid4()),'ranking_id':run['id'],'expected_version':0,'action':'approve','supplier_id':chosen,'confirmed':True})
        path=base+'/decisions/'+decision['id']+'/report';report=req('GET',path)
        assert 'Cost first' in report['sensitivity'] and '90%' in report['sensitivity']
        req('POST',base+'/sensitivity/scenarios',{**payload,'id':str(uuid4()),'name':'Quality first','weights':{'price':'10','quality':'90'}})
        assert req('GET',path)==report
        newmatrix=req('PUT',base+'/matrix',{'context':m['context'],'expected_revision':1,'entries':{**entries,suppliers[0]['id']:{'price':'101','quality':'70'}}})
        req('POST',base+'/sensitivity/scenarios',{**payload,'id':str(uuid4()),'name':'Stale'},409)
        assert len(req('GET',base+'/sensitivity/scenarios?baseline_id='+run['id'])['scenarios'])==2
        assert req('GET',path)==report
    finally:
        client.close()
        with original() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
