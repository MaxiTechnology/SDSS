import os
from uuid import uuid4
import database
import pytest
from psycopg import sql
from fastapi.testclient import TestClient
from app import app, matrix_errors

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
        data['entries'][suppliers[0]['id']]['quality']='91'
        assert client.put(base+'/matrix',json=data).status_code==409
        data['expected_revision']=2;data['entries'][suppliers[0]['id']]['quality']='101'
        assert client.put(base+'/matrix',json=data).status_code==422
        assert client.get('/api/projects/'+str(uuid4())+'/matrix').status_code==404
        s=suppliers[0];client.put(base+'/suppliers/'+s['id'],json={'name':'A edited','location':'','description':'','expected_updated_at':s['updated_at']})
        assert client.put(base+'/matrix',json=data).status_code==409
        assert client.get(base+'/matrix').json()['needs_review']
    finally:
        with original() as conn: conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
