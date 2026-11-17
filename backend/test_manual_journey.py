"""Critical manual journey through real API handlers and isolated PostgreSQL storage."""
import os
from io import BytesIO
from uuid import uuid4
import pytest
from psycopg import sql
from pypdf import PdfReader
from fastapi.testclient import TestClient
import database
from app import app


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_manual_journey_with_mandatory_checks_and_report(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as conn: conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        conn=original();conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return conn
    monkeypatch.setattr(database,'connect',isolated)
    client=TestClient(app)
    def request(method,path,body=None,status=200):
        result=client.request(method,path,json=body)
        assert result.status_code==status,(method,path,result.status_code,result.text)
        return result.json() if result.headers.get('content-type','').startswith('application/json') else result
    try:
        with isolated() as conn:
            database.migrate(conn);database.migrate(conn)
        pid=str(uuid4());base='/api/projects/'+pid
        project=request('POST','/api/projects',{'id':pid,'name':'Synthetic manual acceptance','currency':'USD','estimated_budget':'500'},201)
        assert request('GET',base)['name']==project['name']
        assert request('GET','/api/projects')[0]['workflow_status']=='Draft'
        suppliers=[request('POST',base+'/suppliers',{'id':str(uuid4()),'name':name},201) for name in ['Alpha','Beta','Excluded']]
        config={'criteria':[{'id':'price','name':'Price','unit':'USD','direction':'cost','minimum':'0'},{'id':'quality','name':'Quality','unit':'points / 100','direction':'benefit','minimum':'0','maximum':'100'}], 'mandatory_checks':[{'id':'certificate','name':'Certificate','requirement':'Valid synthetic certificate'}], 'maximum_price':'150','expected_revision':0}
        request('PUT',base+'/criteria',config)
        weights={'weights':{'price':'50','quality':'50'},'approved':False,'criteria_revision':1,'expected_revision':0}
        request('PUT',base+'/weights/manual',weights)
        request('GET',base+'/eligibility',status=422)
        request('PUT',base+'/weights/manual',{**weights,'expected_revision':1,'approved':True})
        assert request('GET',base+'/eligibility')['eligible_count']==0
        request('GET',base+'/matrix',status=422)
        for index,s in enumerate(suppliers):
            review={'checks':{'certificate':{'status':'failed' if index==2 else 'passed','notes':'Synthetic certificate review'}},'total_price':'100' if index==0 else '120','currency':'USD','criteria_revision':1,'supplier_updated_at':s['updated_at'],'expected_revision':0}
            request('PUT',base+'/eligibility/'+s['id'],review)
        pool=request('GET',base+'/eligibility');assert pool['eligible_count']==2
        assert next(s for s in pool['suppliers'] if s['id']==suppliers[2]['id'])['eligibility']=='ineligible'
        matrix=request('GET',base+'/matrix');assert len(matrix['suppliers'])==2
        entries={suppliers[0]['id']:{'price':'100','quality':'95'},suppliers[1]['id']:{'price':'120','quality':None}}
        saved=request('PUT',base+'/matrix',{'context':matrix['context'],'expected_revision':0,'entries':entries});assert not saved['ready']
        request('POST',base+'/rankings',{'context':matrix['context'],'matrix_revision':1},422)
        entries[suppliers[1]['id']]['quality']='80'
        saved=request('PUT',base+'/matrix',{'context':matrix['context'],'expected_revision':1,'entries':entries});assert saved['ready']
        ranking=request('POST',base+'/rankings',{'context':matrix['context'],'matrix_revision':2})
        assert ranking['snapshot']['result']['rows'][0]['name']=='Alpha'
        assert request('GET','/api/projects')[0]['workflow_status']=='Evaluated'
        scenario=request('POST',base+'/sensitivity',{'baseline_id':ranking['id'],'weights':{'price':'90','quality':'10'}})
        assert scenario['baseline_id']==ranking['id']
        assert request('GET',base+'/rankings')['snapshot']==ranking['snapshot']
        decision=request('POST',base+'/decisions',{'id':str(uuid4()),'ranking_id':ranking['id'],'expected_version':0,'action':'approve','supplier_id':suppliers[0]['id'],'confirmed':True,'reason':'Synthetic acceptance approval'})
        assert request('GET','/api/projects')[0]['workflow_status']=='Approved'
        path=base+'/decisions/'+decision['id']+'/report'
        report=request('GET',path);assert report['selected_supplier']=='Alpha'
        assert any('Certificate: passed' in n for n in report['eligibility_notes'])
        pdf=request('GET',path+'.pdf');text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)
        assert 'Synthetic acceptance approval' in text and 'Synthetic manual acceptance' in text
        request('GET','/api/projects/'+str(uuid4())+'/decisions/'+decision['id']+'/report',status=404)
        # A changed eligibility determination invalidates new confirmations, but not historical reports.
        s=suppliers[0]
        review={'checks':{'certificate':{'status':'failed','notes':'Synthetic expiry review'}},'total_price':'100','currency':'USD','criteria_revision':1,'supplier_updated_at':s['updated_at'],'expected_revision':1}
        request('PUT',base+'/eligibility/'+s['id'],review)
        assert request('GET','/api/projects')[0]['workflow_status']=='Needs review'
        assert request('GET',base+'/rankings')['stale']
        assert request('GET',base+'/decisions')['decisions'][0]['stale']
        assert request('GET',path)==report
    finally:
        with original() as conn: conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
