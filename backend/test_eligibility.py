import os
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
import database
from psycopg import sql
from app import app, eligibility_supplier, CheckReview
from datetime import datetime, timezone

client = TestClient(app)

@pytest.mark.parametrize('status', ['passed','failed'])
def test_determination_requires_notes(status):
    with pytest.raises(ValueError): CheckReview(status=status, notes=' ')


def test_eligibility_derivation_and_invalidation():
    now=datetime.now(timezone.utc)
    supplier=dict(id=uuid4(), project_id=uuid4(), name='Test',location='',description='',updated_at=now)
    criteria={'revision':1,'currency':'USD','configuration':{'mandatory_checks':[{'id':'cert'}],'maximum_price':'100'}}
    review={'revision':1,'criteria_revision':1,'supplier_updated_at':now,'reviewer':'Demo User','updated_at':now,
            'determinations':{'currency':'USD','checks':{'cert':{'status':'passed','notes':'Reviewed sample'}},'total_price':'100'}}
    assert eligibility_supplier(supplier,None,criteria)['eligibility']=='pending'
    assert eligibility_supplier(supplier,review,criteria)['eligibility']=='eligible'
    review['determinations']['total_price']='100.01'
    assert eligibility_supplier(supplier,review,criteria)['eligibility']=='ineligible'
    criteria['revision']=2
    result=eligibility_supplier(supplier,review,criteria)
    assert result['needs_review'] and result['eligibility']=='pending' and result['reviewed_at'] is None
    criteria['revision']=1
    criteria['currency']='EUR'
    assert eligibility_supplier(supplier,review,criteria)['eligibility']=='pending'
    criteria['configuration']={'mandatory_checks':[],'maximum_price':None}
    assert eligibility_supplier(supplier,None,criteria)['eligibility']=='eligible'


@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit cloud opt-in required')
def test_review_persistence_gates_and_isolation(monkeypatch):
    original=database.connect
    schema='sdss_test_'+uuid4().hex
    with original() as conn: conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        conn=original()
        conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
        return conn
    monkeypatch.setattr(database,'connect',isolated)
    try:
        with isolated() as conn:
            database.migrate(conn)
            database.migrate(conn)
        pid=str(uuid4());base='/api/projects/'+pid
        assert client.post('/api/projects',json={'id':pid,'name':'Eligibility test','currency':'USD'}).status_code==201
        suppliers=[]
        for name in ['A','B']:
            response=client.post(base+'/suppliers',json={'id':str(uuid4()),'name':name})
            assert response.status_code==201,response.text
            suppliers.append(response.json())
        config={'criteria':[{'id':'price','name':'Price','unit':'USD','direction':'cost'},{'id':'quality','name':'Quality','unit':'points','direction':'benefit'}], 'mandatory_checks':[{'id':'cert','name':'Certificate','requirement':'Valid sample certificate'}], 'maximum_price':'100','expected_revision':0}
        assert client.put(base+'/criteria',json=config).status_code==200
        assert client.get(base+'/eligibility').status_code==422
        weight={'weights':{'price':'50','quality':'50'},'approved':True,'criteria_revision':1,'expected_revision':0}
        assert client.put(base+'/weights/manual',json=weight).status_code==200
        initial=client.get(base+'/eligibility').json()
        assert initial['eligible_count']==0 and not initial['ready']
        first=suppliers[0];url=base+'/eligibility/'+first['id']
        review={'checks':{'cert':{'status':'passed','notes':'Sample reviewed'}},'total_price':'100','currency':'USD','criteria_revision':1,'supplier_updated_at':first['updated_at'],'expected_revision':0}
        response=client.put(url,json=review)
        assert response.status_code==200,response.text
        assert response.json()['eligibility']=='eligible' and response.json()['reviewer']=='Demo User (unauthenticated)'
        assert client.put(url,json=review).json()==response.json()
        assert client.put(url,json={**review,'total_price':'99'}).status_code==409
        assert client.put(url,json={**review,'checks':{}}).status_code==422
        other='/api/projects/'+str(uuid4())+'/eligibility/'+first['id']
        assert client.put(other,json=review).status_code==404
        second=suppliers[1]
        second_review={**review,'supplier_updated_at':second['updated_at']}
        assert client.put(base+'/eligibility/'+second['id'],json=second_review).status_code==200
        assert client.get(base+'/eligibility').json()['ready']
        assert client.put(url,json={**review,'expected_revision':1,'checks':{'cert':{'status':'failed','notes':'Expired sample'}}}).json()['eligibility']=='ineligible'
        assert not client.get(base+'/eligibility').json()['ready']
        edit={k:first[k] for k in ['name','location','description']}
        assert client.put(base+'/suppliers/'+first['id'],json={**edit,'name':'A revised','expected_updated_at':first['updated_at']}).status_code==200
        assert client.put(url,json={**review,'expected_revision':2}).status_code==409
        rows=client.get(base+'/eligibility').json()['suppliers']
        assert rows[0]['needs_review'] and rows[0]['eligibility']=='pending'
        config['expected_revision']=1;config['maximum_price']='101'
        assert client.put(base+'/criteria',json=config).status_code==200
        assert client.get(base+'/eligibility').status_code==422
        weight['criteria_revision']=2;weight['expected_revision']=1
        assert client.put(base+'/weights/manual',json=weight).status_code==200
        assert all(s['needs_review'] for s in client.get(base+'/eligibility').json()['suppliers'])
    finally:
        with original() as conn: conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
