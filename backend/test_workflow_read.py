"""Single-read workflow projection preserves current status and typed values."""
import os
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
import pytest
from psycopg import sql
from psycopg.types.json import Jsonb
import database
from app import serialize,eligibility_supplier,matrix_errors
from workflow import load_projects,derive,matrix_token
from test_workflow import fixture

@pytest.mark.skipif(os.getenv('SDSS_RUN_DATABASE_TESTS')!='1',reason='Explicit isolated cloud opt-in required')
def test_one_read_preserves_workflow_states_precision_and_latest_versions():
    schema='sdss_list_test_'+uuid4().hex
    with database.connect() as c:c.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    try:
        with database.connect() as c:
            c.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)));database.migrate(c)
            class Count:
                def __init__(self):self.n=0
                def execute(self,*args):self.n+=1;return c.execute(*args)
            counted=Count();assert load_projects(counted,serialize,eligibility_supplier,matrix_errors)==[] and counted.n==1
            expected=[]
            for case in ('draft','setup','weights','ready','evaluated','approved','deferred','stale','ai-stale','reviewed'):
                v=list(fixture());p,suppliers,criteria,weights,reviews,matrix,run,decision=v
                if case=='draft':v[1]=[];v[2:]=[None,None,{},None,None,None]
                if case=='setup':v[2:]=[None,None,{},None,None,None]
                if case=='weights':weights['approved']=False;v[5:]=[None,None,None]
                if case=='ready':v[6:]=[None,None]
                if case=='evaluated':v[7]=None
                if case=='deferred':decision['snapshot']['action']='defer'
                if case=='stale':run['context']='outdated'
                if case=='ai-stale':weights['method']='ai'
                if case=='reviewed':
                    criteria['configuration']['mandatory_checks']=[{'id':'cert','name':'Certificate','requirement':'Synthetic check'}]
                    criteria['configuration']['maximum_price']='100'
                    for supplier in suppliers:
                        reviews[supplier['id']]={'supplier_id':supplier['id'],'criteria_revision':1,'supplier_updated_at':supplier['updated_at'],'evidence_revision':0,'revision':1,'reviewer':'Synthetic Reviewer','updated_at':p['updated_at'],'determinations':{'currency':'USD','total_price':'100','checks':{'cert':{'status':'passed','notes':'Accepted synthetic certificate'}}}}
                    eligible=[eligibility_supplier(s,reviews[s['id']],{**criteria,'currency':'USD'}) for s in suppliers]
                    matrix['context']=run['context']=matrix_token({**criteria,'currency':'USD'},weights,eligible)
                p,suppliers,criteria,weights,reviews,matrix,run,decision=v
                saved=c.execute("INSERT INTO purchasing_projects(id,name,currency,category,estimated_budget,updated_at) VALUES (%s,%s,'USD','IT',%s,%s) RETURNING *",(p['id'],case,Decimal('99999999999999.99'),p['updated_at'])).fetchone()
                for index,s in enumerate(suppliers):c.execute('INSERT INTO project_suppliers(id,project_id,name,updated_at,created_at) VALUES (%s,%s,%s,%s,%s)',(s['id'],p['id'],s['name'],s['updated_at'],p['updated_at']+timedelta(microseconds=index)))
                if criteria:c.execute('INSERT INTO project_criteria(project_id,configuration,revision,updated_at) VALUES (%s,%s,%s,%s)',(p['id'],Jsonb(criteria['configuration']),criteria['revision'],criteria['updated_at']))
                if weights:c.execute('INSERT INTO project_weights(project_id,weights,revision,criteria_revision,approved,method,provenance,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',(p['id'],Jsonb(weights['weights']),weights['revision'],weights['criteria_revision'],weights['approved'],weights['method'],Jsonb(weights['provenance']),weights['updated_at']))
                for r in reviews.values():c.execute('INSERT INTO supplier_reviews(supplier_id,determinations,criteria_revision,supplier_updated_at,evidence_revision,revision,reviewer,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',(r['supplier_id'],Jsonb(r['determinations']),r['criteria_revision'],r['supplier_updated_at'],r['evidence_revision'],r['revision'],r['reviewer'],r['updated_at']))
                if matrix:c.execute('INSERT INTO project_matrix(project_id,entries,context,revision,updated_at) VALUES (%s,%s,%s,%s,%s)',(p['id'],Jsonb(matrix['entries']),matrix['context'],matrix['revision'],matrix['updated_at']))
                if run:
                    c.execute("INSERT INTO ranking_runs(id,project_id,context,matrix_revision,snapshot,created_at) VALUES (%s,%s,%s,%s,'{}',%s)",(run['id'],p['id'],run['context'],run['matrix_revision'],run['created_at']))
                    # Older superseded run must not determine currentness.
                    c.execute("INSERT INTO ranking_runs(id,project_id,context,matrix_revision,snapshot,created_at) VALUES (%s,%s,'older',1,'{}',%s)",(uuid4(),p['id'],run['created_at']-timedelta(seconds=5)))
                if decision:
                    c.execute("INSERT INTO project_decisions(id,project_id,ranking_id,version,request,snapshot,actor,created_at) VALUES (%s,%s,%s,2,'{}',%s,'Synthetic Reviewer',%s)",(decision['id'],p['id'],decision['ranking_id'],Jsonb(decision['snapshot']),decision['created_at']))
                    c.execute("INSERT INTO project_decisions(id,project_id,ranking_id,version,request,snapshot,actor,created_at) VALUES (%s,%s,%s,1,'{}','{\"action\":\"defer\"}','Synthetic Reviewer',%s)",(uuid4(),p['id'],decision['ranking_id'],decision['created_at']+timedelta(seconds=20)))
                expected.append({**serialize(saved),**derive(*v,eligibility_supplier,matrix_errors)})
            counted=Count();actual=load_projects(counted,serialize,eligibility_supplier,matrix_errors)
            assert counted.n==1
            assert actual==sorted(expected,key=lambda p:(p['last_activity_at'],p['id']),reverse=True)
            assert {r['workflow_status'] for r in actual}=={'Draft','In progress','Ready to evaluate','Evaluated','Approved','Deferred','Needs review'}
            assert all(r['estimated_budget']=='99999999999999.99' for r in actual)
    finally:
        with database.connect() as c:c.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
