from datetime import datetime,timezone,timedelta
from uuid import uuid4
from copy import deepcopy
from app import eligibility_supplier,matrix_errors
from workflow import derive,matrix_token


def fixture():
    now=datetime.now(timezone.utc);pid=uuid4()
    p={'id':pid,'currency':'USD','category':'IT','updated_at':now}
    suppliers=[{'id':uuid4(),'project_id':pid,'name':name,'location':'','description':'','updated_at':now} for name in ['A','B']]
    config={'criteria':[{'id':'price','name':'Price','unit':'USD','direction':'cost','selected':True,'minimum':'0','maximum':None},{'id':'quality','name':'Quality','unit':'points','direction':'benefit','selected':True,'minimum':'0','maximum':'100'}],'mandatory_checks':[],'maximum_price':None}
    c={'revision':1,'configuration':config,'updated_at':now}
    w={'revision':1,'criteria_revision':1,'approved':True,'method':'manual','provenance':{},'weights':{'price':'50','quality':'50'},'updated_at':now}
    eligible=[eligibility_supplier(s,None,{**c,'currency':'USD'}) for s in suppliers]
    token=matrix_token({**c,'currency':'USD'},w,eligible)
    m={'context':token,'revision':1,'entries':{str(s['id']):{'price':'100','quality':'90'} for s in suppliers},'updated_at':now}
    r={'id':uuid4(),'context':token,'matrix_revision':1,'created_at':now}
    d={'id':uuid4(),'ranking_id':r['id'],'snapshot':{'action':'approve'},'created_at':now+timedelta(seconds=1)}
    return p,suppliers,c,w,{},m,r,d


def state(values):return derive(*values,eligibility_supplier,matrix_errors)


def test_draft_setup_weights_and_ready_stages():
    v=list(fixture());v[1]=[];v[2:]=[None,None,{},None,None,None]
    assert state(v)['workflow_status']=='Draft' and state(v)['workflow_stage']=='Suppliers'
    v=list(fixture());v[2:]=[None,None,{},None,None,None]
    assert state(v)['workflow_stage']=='Criteria'
    v=list(fixture());v[3]=None;v[5:]=[None,None,None]
    assert state(v)['workflow_stage']=='Weights'
    v=list(fixture());v[6:]=[None,None]
    assert state(v)['workflow_status']=='Ready to evaluate'
    v[5]['entries'][str(v[1][0]['id'])]['quality']=None
    assert state(v)['workflow_status']=='In progress'


def test_evaluation_decision_deferral_and_stale_inputs():
    v=list(fixture());v[-1]=None
    assert state(v)['workflow_status']=='Evaluated'
    v=list(fixture());assert state(v)['workflow_status']=='Approved'
    assert state(v)['last_activity_at']==v[-1]['created_at'].isoformat()
    v[-1]['snapshot']['action']='defer';assert state(v)['workflow_status']=='Deferred'
    v[3]['approved']=False
    assert state(v)['workflow_status']=='Needs review' and state(v)['workflow_stage']=='Weights'
    v=list(fixture());v[6]['context']='outdated'
    assert state(v)['workflow_status']=='Needs review' and state(v)['workflow_stage']=='Evaluation matrix'
    v=list(fixture());v[2]['configuration']['mandatory_checks']=[{'id':'cert','name':'Certificate'}]
    assert state(v)['workflow_status']=='Needs review' and state(v)['workflow_stage']=='Eligibility'


def test_ai_context_and_supplier_changes_invalidate_current_decision():
    from ai_weighting import input_context,fingerprint
    v=list(fixture());v[3]['method']='ai'
    v[3]['provenance']={'context':fingerprint(input_context('IT',v[2]['configuration']['criteria']),1)}
    assert state(v)['workflow_status']=='Approved'
    v[0]['category']='Other'
    assert state(v)['workflow_status']=='Needs review'
    v=list(fixture());v[1][0]['updated_at']+=timedelta(seconds=3)
    assert state(v)['workflow_status']=='Needs review'
