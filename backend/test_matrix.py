import os
from uuid import uuid4
import database
import pytest
from psycopg import sql
from fastapi.testclient import TestClient
from app import app, matrix_errors, matrix_recovery, matrix_json

def test_matrix_ranges_missing_and_price_review():
    rows=[{'id':'a','total_price':'100'}]
    criteria=[{'id':'price','minimum':'0','maximum':None},{'id':'quality','minimum':'0','maximum':'100'}]
    assert matrix_errors({'a':{'price':'100','quality':'100'}},rows,criteria,'100')=={}
    assert matrix_errors({'a':{'price':'99','quality':'101'}},rows,criteria,'100')['a']['price']
    assert matrix_errors({},rows,criteria,None)['a']['quality']=='Enter a value.'
    assert matrix_errors({'a':{'price':'NaN','quality':'1.00001'}},rows,criteria,None)['a']['price']

@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_matrix_persistence_and_conflicts(monkeypatch):
    original=database.connect;schema='sdss_test_'+uuid4().hex
    with original() as conn: conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        conn=original();conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return conn
    monkeypatch.setattr(database,'connect',isolated)
    client=TestClient(app)
    try:
        with isolated() as conn: database.migrate(conn)
        pid=str(uuid4());base='/api/projects/'+pid
        client.post('/api/projects',json={'id':pid,'name':'Matrix test','currency':'USD'})
        suppliers=[]
        for name in ['A','B']: suppliers.append(client.post(base+'/suppliers',json={'id':str(uuid4()),'name':name}).json())
        client.put(base+'/criteria',json={'criteria':[{'id':'price','name':'Price','unit':'USD','direction':'cost','minimum':'0'},{'id':'quality','name':'Quality','unit':'points','direction':'benefit','minimum':'0','maximum':'100'}],'expected_revision':0})
        assert client.get(base+'/matrix').status_code==422
        client.put(base+'/weights/manual',json={'weights':{'price':'50','quality':'50'},'approved':True,'criteria_revision':1,'expected_revision':0})
        initial=client.get(base+'/matrix').json();assert not initial['ready']
        draft={'context':initial['context'],'expected_revision':0,'entries':initial['entries']}
        assert client.put(base+'/matrix',json=draft).status_code==200
        data={**draft,'expected_revision':1,'entries':{s['id']:{'price':'100','quality':'90'} for s in suppliers}}
        result=client.put(base+'/matrix',json=data);assert result.status_code==200,result.text
        assert result.json()['ready'] and client.get(base+'/matrix').json()['ready']
        assert client.put(base+'/matrix',json=data).json()['revision']==2
        ranking_payload={'context':initial['context'],'matrix_revision':2}
        # Identical suppliers cannot yield a meaningful ranking.
        assert client.post(base+'/rankings',json=ranking_payload).status_code==422
        changed={**data,'expected_revision':2,'entries':{sid:dict(values) for sid,values in data['entries'].items()}}
        changed['entries'][suppliers[0]['id']]['quality']='95'
        assert client.put(base+'/matrix',json=changed).status_code==200
        ranking_payload['matrix_revision']=3
        run=client.post(base+'/rankings',json=ranking_payload)
        assert run.status_code==200,run.text
        assert client.post(base+'/rankings',json=ranking_payload).json()['id']==run.json()['id']
        assert not client.get(base+'/rankings').json()['stale']
        assert client.get('/api/projects/'+str(uuid4())+'/rankings').status_code==404
        data['entries'][suppliers[0]['id']]['quality']='91'
        assert client.put(base+'/matrix',json=data).status_code==409
        data['expected_revision']=3;data['entries'][suppliers[0]['id']]['quality']='101'
        assert client.put(base+'/matrix',json=data).status_code==422
        assert client.get('/api/projects/'+str(uuid4())+'/matrix').status_code==404
        s=suppliers[0];client.put(base+'/suppliers/'+s['id'],json={'name':'A edited','location':'','description':'','expected_updated_at':s['updated_at']})
        assert client.put(base+'/matrix',json=data).status_code==409
        recovery=client.get(base+'/matrix').json()
        assert recovery['needs_review'] and not recovery['ready'] and recovery['recovery']['count']==4
        # Simulate a pre-migration matrix; recover only from its exact ranking snapshot.
        with isolated() as conn:conn.execute('UPDATE project_matrix SET input_basis=NULL WHERE project_id=%s',(pid,))
        legacy=client.get(base+'/matrix').json()
        assert legacy['recovery']==recovery['recovery']
        assert client.post(base+'/rankings',json={'context':legacy['context'],'matrix_revision':3}).status_code==409
        saved=client.put(base+'/matrix',json={'context':legacy['context'],'expected_revision':3,'entries':legacy['recovery']['entries']})
        assert saved.status_code==200,saved.text
        assert saved.json()['ready'] and not saved.json()['needs_review'] and saved.json()['revision']==4
        assert client.put(base+'/matrix',json={'context':legacy['context'],'expected_revision':3,'entries':legacy['recovery']['entries']}).json()['revision']==4
        assert client.get(base+'/rankings').json()['stale']
        assert client.get(base+'/rankings').json()['snapshot']==run.json()['snapshot']
    finally:
        with original() as conn: conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def test_recovery_requires_matching_meaning_currency_and_current_validation():
    criteria={'currency':'USD','configuration':{'maximum_price':'110'}}
    suppliers=[{'id':'a','name':'A','total_price':'100'},{'id':'c','name':'C','total_price':'110'}]
    selected=[{'id':'price','name':'Price','unit':'USD','direction':'cost','minimum':'0'}, {'id':'quality','name':'Quality','unit':'points / 100','direction':'benefit','maximum':'100'}]
    basis={'currency':'USD','criteria':selected}
    row={'entries':{'a':{'price':'100','quality':'90'},'b':{'price':'120','quality':'80'}},'context':'old','revision':1,'input_basis':basis}
    result=matrix_recovery(row,criteria,suppliers,selected)
    assert result['count']==2 and result['entries']=={'a':{'price':'100','quality':'90'},'c':{'price':None,'quality':None}}
    response=matrix_json(row,criteria,suppliers,selected,'new')
    assert response['needs_review'] and not response['ready'] and response['entries']['a']['price'] is None
    assert response['recovery']==result
    assert matrix_recovery(row,{**criteria,'currency':'RUB'},suppliers,selected)['count']==0
    assert not matrix_recovery({**row,'input_basis':None},criteria,suppliers,selected)['available']
    changed=[selected[0],{**selected[1],'unit':'points / 5'}]
    assert matrix_recovery(row,criteria,suppliers,changed)['entries']['a']['quality'] is None
    assert matrix_recovery(row,criteria,[{'id':'a','total_price':'105'},suppliers[1]],selected)['entries']['a']['price'] is None
    bounded=[selected[0],{**selected[1],'maximum':'80'}]
    assert matrix_recovery(row,criteria,suppliers,bounded)['entries']['a']['quality'] is None
