"""Workspace pages use saved records; templates apply atomically as unapproved drafts."""
import os
from uuid import uuid4
import pytest
from psycopg import sql
import database
from app import app
from fastapi.testclient import TestClient

@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit isolated cloud opt-in required')
def test_directories_template_lifecycle_atomic_apply_and_saved_reports(monkeypatch):
    original=database.connect;schema='sdss_workspace_test_'+uuid4().hex
    with original() as c:c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    def isolated():
        c=original();c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));return c
    monkeypatch.setattr(database,'connect',isolated)
    client=TestClient(app)
    def req(method,path,body=None,status=200):
        r=client.request(method,path,json=body);assert r.status_code==status,(path,r.text);return r.json() if r.content else None
    def project(name,currency='USD'):
        pid=str(uuid4());req('POST','/api/projects',{'id':pid,'name':name,'currency':currency},201);return pid
    def supplier(pid,name):return req('POST',f'/api/projects/{pid}/suppliers',{'id':str(uuid4()),'name':name,'location':'Synthetic location','description':'Original supplier details'},201)
    def preview(tid,pid):return req('GET',f'/api/workspace/templates/{tid}/preview?project_id={pid}')
    def application(p):return {'id':str(uuid4()),'project_id':p['project_id'],'expected_project_updated_at':p['project_updated_at'],'expected_criteria_revision':p['criteria_revision'],'expected_weight_revision':p['weight_revision'],'expected_template_version':p['template']['version'],'confirmed':True}
    try:
        database.open_pool(min_size=2,max_size=4)
        with isolated() as c:database.migrate(c);database.migrate(c)
        for page,key in [('suppliers','suppliers'),('templates','templates'),('evaluations','projects'),('reports','reports')]:assert req('GET','/api/workspace/'+page)[key]==[]
        source=project('Synthetic template source');base='/api/projects/'+source
        suppliers=[supplier(source,n) for n in ('Alpha','Beta','Excluded')]
        config={'criteria':[{'id':'price','name':'Price','unit':'USD','direction':'cost','minimum':'0'},{'id':'quality','name':'Quality','unit':'points','direction':'benefit','minimum':'0','maximum':'100'}],'mandatory_checks':[{'id':'cert','name':'Certificate','requirement':'Synthetic review'}],'maximum_price':'150','expected_revision':0}
        req('PUT',base+'/criteria',config)
        req('PUT',base+'/weights/manual',{'weights':{'price':'50','quality':'50'},'criteria_revision':1,'expected_revision':0,'approved':True})
        for i,s in enumerate(suppliers):req('PUT',base+'/eligibility/'+s['id'],{'checks':{'cert':{'status':'failed' if i==2 else 'passed','notes':'Synthetic review'}},'total_price':str(100+i*20),'currency':'USD','criteria_revision':1,'supplier_updated_at':s['updated_at'],'expected_revision':0})
        m=req('GET',base+'/matrix');req('PUT',base+'/matrix',{'context':m['context'],'expected_revision':0,'entries':{s['id']:{'price':str(100+i*20),'quality':str(95-i*10)} for i,s in enumerate(suppliers[:2])}})
        run=req('POST',base+'/rankings',{'context':m['context'],'matrix_revision':1})
        decision=req('POST',base+'/decisions',{'id':str(uuid4()),'ranking_id':run['id'],'expected_version':0,'action':'approve','supplier_id':suppliers[0]['id'],'confirmed':True})
        reportpath=base+'/decisions/'+decision['id']+'/report';saved_report=req('GET',reportpath)
        ev=req('GET','/api/workspace/evaluations')['projects'][0];assert ev['workflow_status']=='Approved' and ev['evaluation_current'] and ev['calculation']['rows'][0]['name']=='Alpha'
        report=req('GET','/api/workspace/reports')['reports'][0];assert report['id']==decision['id'] and report['latest_saved'] and report['selected_supplier']=='Alpha'
        target=project('Synthetic template target');supplier(target,'Target One');supplier(target,'Target Two')
        copied=req('POST',f'/api/projects/{target}/suppliers',{'id':str(uuid4()),'name':suppliers[0]['name'],'location':suppliers[0]['location'],'description':suppliers[0]['description']},201)
        directory=req('GET','/api/workspace/suppliers');assert len(directory['suppliers'])==6 and len(directory['projects'])==2 and copied['id']!=suppliers[0]['id']
        library=req('GET','/api/workspace/templates');meta=next(p for p in library['projects'] if p['id']==source)
        body={'id':str(uuid4()),'name':'Reusable synthetic configuration','notes':'Fixture only','source_project_id':source,'expected_source_updated_at':meta['updated_at'],'expected_criteria_revision':meta['criteria_revision'],'expected_weight_revision':meta['weight_revision'],'include_weights':True}
        template=req('POST','/api/workspace/templates',body,201);tid=template['id'];assert template['weights']=={'price':'50.00','quality':'50.00'}
        assert req('POST','/api/workspace/templates',body,201)['id']==tid
        req('POST','/api/workspace/templates',{**body,'id':str(uuid4()),'expected_criteria_revision':999},409)
        req('POST','/api/workspace/templates',{**body,'name':'Changed retry'},409)
        p=preview(tid,target);apply=application(p);applypath=f'/api/workspace/templates/{tid}/apply'
        req('POST',applypath,{**apply,'confirmed':False},422)
        req('POST',applypath,{**apply,'expected_criteria_revision':99},409)
        assert req('GET',f'/api/projects/{target}/criteria')['revision']==0
        result=req('POST',applypath,apply);assert result['criteria_revision']==1 and result['weight_revision']==1
        assert req('POST',applypath,apply)==result
        draft=req('GET',f'/api/projects/{target}/weights/manual');assert not draft['approved'] and draft['weights']==template['weights']
        req('GET',f'/api/projects/{target}/eligibility',status=422)
        assert req('GET',reportpath)==saved_report
        req('PUT',base+'/weights/manual',{'weights':{'price':'60','quality':'40'},'criteria_revision':1,'expected_revision':1,'approved':True})
        req('PUT',base+'/suppliers/'+suppliers[0]['id'],{'name':'Alpha changed','location':'New location','description':'Changed source details','expected_updated_at':suppliers[0]['updated_at']})
        copied_now=next(s for s in req('GET',f'/api/projects/{target}/suppliers') if s['id']==copied['id']);assert copied_now['name']=='Alpha' and copied_now['description']=='Original supplier details'
        library=req('GET','/api/workspace/templates');assert library['templates'][0]['weights']=={'price':'50.00','quality':'50.00'}
        source_ev=next(p for p in req('GET','/api/workspace/evaluations')['projects'] if p['id']==source);assert source_ev['workflow_status']=='Needs review' and not source_ev['evaluation_current']
        assert req('GET',reportpath)==saved_report
        edit={'name':template['name'],'notes':'Archived fixture','active':False,'expected_version':1};archived=req('PUT',f'/api/workspace/templates/{tid}',edit);assert archived['version']==2
        assert req('PUT',f'/api/workspace/templates/{tid}',edit)['version']==2
        req('GET',f'/api/workspace/templates/{tid}/preview?project_id={target}',status=422)
        req('POST',applypath,{**application(p),'id':str(uuid4())},409)
        restored=req('PUT',f'/api/workspace/templates/{tid}',{**edit,'active':True,'expected_version':2});assert restored['version']==3
        req('PUT',f'/api/workspace/templates/{tid}',{**edit,'name':'Stale edit','expected_version':1},409)
        other=project('Different currency','EUR');supplier(other,'Euro A');supplier(other,'Euro B')
        req('GET',f'/api/workspace/templates/{tid}/preview?project_id={other}',status=422)
        meta=next(p for p in req('GET','/api/workspace/templates')['projects'] if p['id']==source)
        plain=req('POST','/api/workspace/templates',{**body,'id':str(uuid4()),'name':'Criteria only','include_weights':False,'expected_source_updated_at':meta['updated_at'],'expected_weight_revision':meta['weight_revision']},201)
        plain_path=f"/api/workspace/templates/{plain['id']}/apply";plain_apply=application(preview(plain['id'],target));req('POST',plain_path,plain_apply)
        draft=req('GET',f'/api/projects/{target}/weights/manual');assert draft['revision']==2 and set(draft['weights'].values())=={'0.00'} and not draft['approved']
        # Fail the second write, proving the first write and application ledger roll back.
        retry=application(preview(plain['id'],target))
        class FailWeight:
            def __init__(self,c):self.c=c
            def __enter__(self):self.c.__enter__();return self
            def __exit__(self,*args):return self.c.__exit__(*args)
            def execute(self,query,*args):
                if str(query).startswith('INSERT INTO project_weights'):raise database.psycopg.OperationalError('Synthetic interrupted template application')
                return self.c.execute(query,*args)
        monkeypatch.setattr(database,'connect',lambda:FailWeight(isolated()))
        req('POST',plain_path,retry,503)
        monkeypatch.setattr(database,'connect',isolated)
        assert req('GET',f'/api/projects/{target}/criteria')['revision']==2
        assert req('GET',f'/api/projects/{target}/weights/manual')['revision']==2
        with isolated() as c:assert not c.execute('SELECT 1 FROM template_applications WHERE id=%s',(retry['id'],)).fetchone()
        assert req('POST',plain_path,retry)['criteria_revision']==3
        assert req('GET',reportpath)==saved_report
    finally:
        client.close();database.close_pool()
        with original() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
