from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4
from copy import deepcopy
import pytest
from pypdf import PdfReader
from fastapi.testclient import TestClient
import app as module
from reports import report_data, render_pdf


def saved(action='approve'):
    suppliers=[{'id':'a','name':'Alpha & Sons <Test>'},{'id':'b','name':'Beta'}]
    rankings=[{**suppliers[0],'rank':1,'score':'0.75'},{**suppliers[1],'rank':2,'score':'0.25'}]
    return dict(id=uuid4(),project_id=uuid4(),ranking_id=uuid4(),version=1,created_at=datetime(2026,11,18,tzinfo=timezone.utc),actor='Demo User (unauthenticated)',snapshot={'action':action,'supplier':None if action=='defer' else rankings[1 if action=='alternative' else 0], 'reason':'Await funding' if action=='defer' else 'Saved justification', 'revision_reason':'', 'project':{'name':'Laptop renewal / Закупка','category':'IT','currency':'RUB','estimated_budget':'500000.00','target_date':None,'description':'Five laptops'},'ranking':{'criteria':[{'id':'price','name':'Total price','unit':'RUB','direction':'cost'},{'id':'quality','name':'Quality','unit':'points','direction':'benefit'}], 'weights':{'price':'50','quality':'50'},'suppliers':suppliers,'entries':{'a':{'price':'490000','quality':'95'},'b':{'price':'450000','quality':'80'}},'result':{'rows':rankings}}})


@pytest.mark.parametrize('action',['approve','alternative','defer'])
def test_pdf_matches_saved_decision(action):
    row=saved(action);before=deepcopy(row);report=report_data(row)
    content=render_pdf(report);reader=PdfReader(BytesIO(content));text='\n'.join(p.extract_text() for p in reader.pages)
    assert row==before and content.startswith(b'%PDF')
    for value in [report['title'],report['outcome'],'490000','450000','0.750000','Saved supplier input values','No sensitivity findings','Закупка','Alpha & Sons <Test>']:
        assert value in text
    assert 'None - no award' in text if action=='defer' else report['selected_supplier'] in text
    assert all('Page ' in p.extract_text() for p in reader.pages)


def test_saved_report_endpoint_never_reads_current_drafts(monkeypatch):
    row=saved()
    class Connection:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def execute(self,query,args):
            assert query=='SELECT * FROM project_decisions WHERE project_id=%s AND id=%s'
            self.row=row if args==(row['project_id'],row['id']) else None
            return self
        def fetchone(self):return self.row
    monkeypatch.setattr(module.database,'connect',Connection)
    client=TestClient(module.app);path=f"/api/projects/{row['project_id']}/decisions/{row['id']}/report"
    initial=client.get(path);assert initial.status_code==200
    assert client.get(path).json()==initial.json()
    pdf=client.get(path+'.pdf');assert pdf.status_code==200 and pdf.headers['content-type']=='application/pdf'
    assert str(row['id']) in pdf.headers['content-disposition']
    assert client.get(f"/api/projects/{uuid4()}/decisions/{row['id']}/report").status_code==404


def test_long_reason_and_large_tables_paginate():
    row=saved();row['snapshot']['reason']='Long explanation & review. '*180
    ranking=row['snapshot']['ranking']
    for index in range(25):
        sid=str(index);ranking['suppliers'].append({'id':sid,'name':'Supplier '+sid});ranking['entries'][sid]={'price':'450000','quality':'80'}
    reader=PdfReader(BytesIO(render_pdf(report_data(row))))
    assert len(reader.pages)>=4
    assert 'Report limitations' in reader.pages[-1].extract_text()


def test_pdf_rejects_unsupported_glyphs_instead_of_corrupting_supplier_names():
    row=saved();row['snapshot']['project']['name']='示例'
    with pytest.raises(ValueError,match='some characters'):
        render_pdf(report_data(row))
