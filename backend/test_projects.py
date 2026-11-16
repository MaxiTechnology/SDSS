import os
from uuid import uuid4
import pytest
import database
from app import app
from fastapi.testclient import TestClient
from psycopg import sql
client = TestClient(app)

def payload(**changes):
    return dict(id=str(uuid4()), name=' Laptop renewal ', category='IT & Hardware', currency='USD', estimated_budget='140000.25', target_date='2027-01-20', description='Compare suppliers', **changes) if not changes else {**payload(), **changes}

@pytest.mark.parametrize('changes', [{'name':'   '},{'estimated_budget':'-1'},{'estimated_budget':'1.001'},{'currency':'BAD'},{'target_date':'invalid'}])
def test_invalid_input(changes):
    assert client.post('/api/projects', json=payload(**changes)).status_code == 422
    assert client.put('/api/projects/'+str(uuid4()), json={**payload(**changes), 'expected_updated_at':'2026-11-16T10:00:00Z'}).status_code == 422

def test_storage_error_is_private(monkeypatch):
    def fail(): raise database.psycopg.OperationalError('secret password')
    monkeypatch.setattr(database, 'connect', fail)
    result=client.get('/api/projects')
    assert result.status_code==503
    assert 'secret' not in result.text

@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1', reason='Explicit cloud test opt-in required')
def test_persistence_migration_and_retry(monkeypatch):
    original=database.connect
    schema='sdss_test_'+uuid4().hex
    with original() as connection:
        connection.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        connection=original()
        connection.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
        return connection
    monkeypatch.setattr(database, 'connect', isolated)
    try:
        with isolated() as connection:
            database.migrate(connection)
            database.migrate(connection)
        data=payload()
        result=client.post('/api/projects', json=data)
        assert result.status_code==201, result.text
        saved=result.json()
        assert saved['name']=='Laptop renewal'
        assert saved['estimated_budget']=='140000.25'
        assert saved['status']=='Draft'
        assert client.get('/api/projects/'+data['id']).json()==saved
        assert len(client.get('/api/projects').json())==1
        assert client.post('/api/projects', json=data).status_code==200
        assert len(client.get('/api/projects').json())==1
        assert client.post('/api/projects', json={**data,'name':'Changed'}).status_code==409
        assert client.get('/api/projects/'+str(uuid4())).status_code==404
        edit={**data, 'name':'Revised project', 'currency':'RUB', 'estimated_budget':'500000.00', 'expected_updated_at':saved['updated_at']}
        result=client.put('/api/projects/'+data['id'], json=edit)
        assert result.status_code==200, result.text
        revised=result.json()
        assert revised['currency']=='RUB' and revised['estimated_budget']=='500000.00'
        assert revised['reference']==saved['reference'] and revised['created_at']==saved['created_at']
        assert revised['updated_at']!=saved['updated_at']
        assert client.get('/api/projects/'+data['id']).json()==revised
        assert client.put('/api/projects/'+data['id'], json=edit).json()==revised
        assert client.put('/api/projects/'+data['id'], json={**edit,'name':'Stale change'}).status_code==409
        assert client.get('/api/projects/'+data['id']).json()==revised
        assert client.put('/api/projects/'+str(uuid4()), json=edit).status_code==404
        base='/api/projects/'+data['id']
        assert client.get(base+'/suppliers').json()==[]
        assert client.get(base+'/supplier-readiness').status_code==422
        assert client.post(base+'/suppliers',json={'id':str(uuid4()),'name':'  '}).status_code==422
        supplier={'id':str(uuid4()),'name':' Dell Technologies ','location':'Austin','description':'Hardware'}
        first=client.post(base+'/suppliers',json=supplier)
        assert first.status_code==201,first.text
        first=first.json()
        assert first['name']=='Dell Technologies'
        assert client.post(base+'/suppliers',json=supplier).status_code==200
        assert len(client.get(base+'/suppliers').json())==1
        assert client.get(base+'/supplier-readiness').status_code==422
        second=client.post(base+'/suppliers',json={'id':str(uuid4()),'name':'Apex'}).json()
        assert client.get(base+'/supplier-readiness').json()=={'ready':True,'supplier_count':2}
        third=client.post(base+'/suppliers',json={'id':str(uuid4()),'name':'Lenovo'}).json()
        criteria_url=base+'/criteria'
        initial=client.get(criteria_url).json()
        assert initial['revision']==0 and initial['currency']=='RUB'
        assert initial['configuration']['criteria'][0]['direction']=='cost'
        assert initial['configuration']['maximum_price'] is None
        configuration=initial['configuration']
        configuration['criteria'].append(dict(id='custom',name='Battery life',unit='hours',direction='benefit',selected=True,minimum='0',maximum='24'))
        configuration['mandatory_checks']=[dict(id='security',name='Security certification',requirement='Valid certificate through delivery')]
        configuration['maximum_price']='500000.00'
        criteria_payload={**configuration,'expected_revision':0}
        criteria_result=client.put(criteria_url,json=criteria_payload)
        assert criteria_result.status_code==200,criteria_result.text
        version=criteria_result.json()
        assert version['revision']==1
        assert client.get(criteria_url).json()==version
        assert client.put(criteria_url,json=criteria_payload).json()==version
        changed={**criteria_payload,'maximum_price':'400000.00'}
        assert client.put(criteria_url,json=changed).status_code==409
        changed['expected_revision']=1
        updated=client.put(criteria_url,json=changed).json()
        assert updated['revision']==2 and updated['configuration']['maximum_price']=='400000.00'

        assert client.get('/api/projects').json()[0]['supplier_count']==3
        other=client.post('/api/projects',json=payload()).json()
        otherbase='/api/projects/'+other['id']
        assert client.get(otherbase+'/suppliers').json()==[]
        change={'name':'Dell revised','location':'London','description':'Updated','expected_updated_at':first['updated_at']}
        assert client.put(otherbase+'/suppliers/'+first['id'],json=change).status_code==404
        revised_supplier=client.put(base+'/suppliers/'+first['id'],json=change).json()
        assert revised_supplier['name']=='Dell revised'
        assert client.put(base+'/suppliers/'+first['id'],json=change).json()==revised_supplier
        assert client.put(base+'/suppliers/'+first['id'],json={**change,'name':'stale'}).status_code==409
        assert client.delete(base+'/suppliers/'+first['id'],params={'expected_updated_at':first['updated_at']}).status_code==409
        for item in (second,third):
            assert client.delete(base+'/suppliers/'+item['id'],params={'expected_updated_at':item['updated_at']}).status_code==204
            assert client.delete(base+'/suppliers/'+item['id'],params={'expected_updated_at':item['updated_at']}).status_code==204
        assert client.get(base+'/supplier-readiness').status_code==422
        assert client.get(criteria_url).status_code==422
        assert client.put(criteria_url,json=changed).status_code==422
        assert len(client.get(base+'/suppliers').json())==1
        assert client.get('/api/projects/'+str(uuid4())+'/suppliers').status_code==404
    finally:
        with original() as connection:
            connection.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


@pytest.mark.parametrize('change', [
    {'minimum':'100','maximum':'0'}, {'minimum':'0','maximum':'0'},
    {'minimum':'NaN'}, {'maximum':'Infinity'}, {'direction':'wrong'}, {'unit':' '}, {'name':' '}
])
def test_criterion_validation(change):
    from app import ScoringCriterion
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ScoringCriterion.model_validate({'id':'custom','name':'Custom','unit':'points','direction':'benefit',**change})


def test_criteria_configuration_validation():
    from app import CriteriaConfiguration, default_criteria
    from pydantic import ValidationError
    config=default_criteria('USD')
    for criterion in config['criteria']:
        criterion['selected']=False
    with pytest.raises(ValidationError):
        CriteriaConfiguration.model_validate(config)
    config=default_criteria('USD')
    config['criteria'][1]['name']=config['criteria'][0]['name']
    with pytest.raises(ValidationError):
        CriteriaConfiguration.model_validate(config)
    config=default_criteria('USD')
    config['maximum_price']='-1'
    with pytest.raises(ValidationError):
        CriteriaConfiguration.model_validate(config)
