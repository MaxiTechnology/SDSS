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
    finally:
        with original() as connection:
            connection.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
