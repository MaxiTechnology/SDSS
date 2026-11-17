from uuid import uuid4
import os
import pytest
from psycopg import sql
from fastapi.testclient import TestClient
import database
from app import app, DecisionRequest


def test_required_reasons_and_confirmation():
    base=dict(id=uuid4(),ranking_id=uuid4(),expected_version=0,action='approve',supplier_id=uuid4(),confirmed=True)
    assert DecisionRequest(**base).action=='approve'
    for extra in [dict(confirmed=False),dict(action='alternative',reason='  '),dict(action='defer'),dict(expected_version=1)]:
        with pytest.raises(ValueError): DecisionRequest(**{**base,**extra})
    assert DecisionRequest(**{**base,'action':'defer','supplier_id':None,'reason':' Wait '}).reason=='Wait'


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_decision_history_retries_and_stale_inputs(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as conn: conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        conn=original();conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return conn
    monkeypatch.setattr(database,'connect',isolated)
    client=TestClient(app)
    try:
        with isolated() as conn: database.migrate(conn)
        pid=str(uuid4());base='/api/projects/'+pid
        result=client.post('/api/projects',json={'id':pid,'name':'Decision test','currency':'USD'})
        assert result.status_code in (200,201),result.text
        suppliers=[client.post(base+'/suppliers',json={'id':str(uuid4()),'name':name}).json() for name in ['A','B']]
        client.put(base+'/criteria',json={'criteria':[{'id':'price','name':'Price','unit':'USD','direction':'cost','minimum':'0'},{'id':'quality','name':'Quality','unit':'points','direction':'benefit','minimum':'0','maximum':'100'}],'expected_revision':0})
        client.put(base+'/weights/manual',json={'weights':{'price':'50','quality':'50'},'approved':True,'criteria_revision':1,'expected_revision':0})
        matrix=client.get(base+'/matrix').json()
        entries={suppliers[0]['id']:{'price':'100','quality':'95'},suppliers[1]['id']:{'price':'120','quality':'80'}}
        client.put(base+'/matrix',json={'context':matrix['context'],'expected_revision':0,'entries':entries})
        run=client.post(base+'/rankings',json={'context':matrix['context'],'matrix_revision':1}).json()
        rows=run['snapshot']['result']['rows'];winner=rows[0]['id'];other=rows[1]['id']
        payload={'id':str(uuid4()),'ranking_id':run['id'],'expected_version':0,'action':'approve','supplier_id':winner,'confirmed':True}
        assert client.get(base+'/decisions').json()=={'decisions':[]}
        for sid in [other,str(uuid4())]: assert client.post(base+'/decisions',json={**payload,'supplier_id':sid}).status_code==422
        saved=client.post(base+'/decisions',json=payload);assert saved.status_code==200,saved.text
        report_path=base+'/decisions/'+saved.json()['id']+'/report'
        report=client.get(report_path).json()
        assert report['selected_supplier']=='A'
        assert report['eligibility_notes']
        assert saved.json()['version']==1 and saved.json()['snapshot']['supplier']['id']==winner
        assert client.post(base+'/decisions',json=payload).json()['id']==saved.json()['id']
        assert client.post(base+'/decisions',json={**payload,'reason':'different'}).status_code==409
        assert client.post(base+'/decisions',json={**payload,'id':str(uuid4())}).status_code==409
        alt={**payload,'id':str(uuid4()),'expected_version':1,'action':'alternative','supplier_id':other,'reason':'Preferred service support','revision_reason':'Updated purchasing review'}
        assert client.post(base+'/decisions',json={**alt,'reason':' '}).status_code==422
        result=client.post(base+'/decisions',json=alt);assert result.status_code==200,result.text
        defer={**payload,'id':str(uuid4()),'expected_version':2,'action':'defer','supplier_id':None,'reason':'Await funding','revision_reason':'Funding review'}
        result=client.post(base+'/decisions',json=defer);assert result.status_code==200,result.text
        assert result.json()['snapshot']['supplier'] is None
        assert client.get(base+'/rankings').json()['snapshot']==run['snapshot']
        history=client.get(base+'/decisions').json()['decisions'];assert [d['version'] for d in history]==[3,2,1]
        assert history[2]['snapshot']==saved.json()['snapshot']
        s=suppliers[0];result=client.put(base+'/suppliers/'+s['id'],json={'name':'Changed supplier','expected_updated_at':s['updated_at']});assert result.status_code==200,result.text
        assert client.get(report_path).json()==report
        assert client.get(base+'/decisions').json()['decisions'][0]['stale']
        assert client.post(base+'/decisions',json={**defer,'id':str(uuid4()),'expected_version':3}).status_code==409
        assert client.post(base+'/decisions',json=defer).json()['stale']
    finally:
        with original() as conn: conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
