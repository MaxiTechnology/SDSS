from uuid import uuid4
from datetime import datetime, timezone
from fastapi.testclient import TestClient
import pytest
import app as module
from app import SensitivityRequest


def test_scenario_weight_validation():
    for weights in [{'x':'50','y':'49'},{'x':'NaN','y':'100'},{'x':'100.001','y':'-0.001'}]:
        with pytest.raises(ValueError): SensitivityRequest(baseline_id=uuid4(),weights=weights)


def test_scenario_reversal_and_stale_baseline(monkeypatch):
    rid=uuid4()
    snapshot={'entries':{'a':{'x':'3','y':'3'},'b':{'x':'1','y':'1'}},'suppliers':[{'id':'a','name':'A'},{'id':'b','name':'B'}], 'criteria':[{'id':'x','name':'Quality','direction':'benefit'},{'id':'y','name':'Price','direction':'cost'}], 'weights':{'x':'75','y':'25'}}
    row={'id':rid,'context':'current','matrix_revision':1,'snapshot':snapshot,'created_at':datetime.now(timezone.utc)}
    class Connection:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def execute(self,query,args):
            assert query.startswith('SELECT') # Simulation must never write approved data.
            self.value={'revision':1} if 'project_matrix' in query else row
            return self
        def fetchone(self): return self.value
    monkeypatch.setattr(module.database,'connect',Connection)
    monkeypatch.setattr(module,'matrix_context',lambda *args:(None,None,None,'current'))
    client=TestClient(module.app);url=f'/api/projects/{uuid4()}/sensitivity'
    payload={'baseline_id':str(rid),'weights':{'x':'25','y':'75'}}
    result=client.post(url,json=payload)
    assert result.status_code==200,result.text
    assert result.json()['result']['rows'][0]['id']=='b'
    assert snapshot['weights']=={'x':'75','y':'25'}
    assert client.post(url,json={**payload,'weights':{'x':'50','z':'50'}}).status_code==422
    row['context']='old'
    assert client.post(url,json=payload).status_code==409
