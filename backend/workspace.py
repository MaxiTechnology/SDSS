"""Shared workspace directories and explicit draft-only template applications."""
from datetime import datetime
from uuid import UUID
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,Field,field_validator
import database,auth,project_read,workflow
from psycopg.types.json import Jsonb

router=APIRouter(prefix='/api/workspace')
PROJECT_CHOICES="""SELECT p.id,p.project_number,p.name,p.currency,p.updated_at,
 (SELECT count(*) FROM project_suppliers s WHERE s.project_id=p.id) AS supplier_count,
 COALESCE(c.revision,0) AS criteria_revision,COALESCE(w.revision,0) AS weight_revision,
 COALESCE(w.approved AND w.criteria_revision=c.revision,false) AS weights_approved,w.method AS weight_method,
 p.category,c.configuration AS criteria_configuration,w.provenance->>'context' AS weight_context
 FROM purchasing_projects p LEFT JOIN project_criteria c ON c.project_id=p.id
 LEFT JOIN project_weights w ON w.project_id=p.id ORDER BY p.updated_at DESC,p.id"""

def choices(rows):
    from ai_weighting import fingerprint,input_context
    result=[]
    for row in rows:
        r=dict(row);config=r.pop('criteria_configuration',None);context=r.pop('weight_context',None);category=r.pop('category','')
        selected=[c for c in config['criteria'] if c['selected']] if config else []
        if r['weights_approved'] and r['weight_method']=='ai':r['weights_approved']=context==fingerprint(input_context(category,selected),r['criteria_revision'])
        result.append({**r,'id':str(r['id']),'reference':f"PRJ-{int(r['project_number']):06d}",'criteria_count':len(selected)})
    return result


def template_json(r):
    return {k:(str(v) if k in ('id','source_project_id') else v.isoformat() if isinstance(v,datetime) else v)
            for k,v in r.items() if k not in ('request','created_by')}


@router.get('/suppliers')
def supplier_directory():
    from app import supplier_json
    with database.connect() as c:
        data=c.execute("SELECT COALESCE((SELECT jsonb_agg(x) FROM ("+PROJECT_CHOICES+") x),'[]'::jsonb) AS projects, COALESCE((SELECT jsonb_agg(x ORDER BY x.name,x.project_number,x.id) FROM (SELECT s.*,p.name AS project_name,p.project_number FROM project_suppliers s JOIN purchasing_projects p ON p.id=s.project_id) x),'[]'::jsonb) AS suppliers").fetchone()
    suppliers=[]
    for item in data['suppliers']:
        row=workflow._record(item)
        suppliers.append({**supplier_json(row),'project_name':row['project_name'],'reference':f"PRJ-{row['project_number']:06d}"})
    return {'projects':choices(data['projects']),'suppliers':suppliers}


@router.get('/evaluations')
def evaluations():
    from app import serialize,eligibility_supplier,matrix_errors
    query="SELECT state.*, (SELECT jsonb_build_object('id',r.id,'created_at',r.created_at,'rows',COALESCE(r.snapshot#>'{result,rows}','[]'::jsonb)) FROM ranking_runs r WHERE r.project_id=state.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS _evaluation FROM ("+workflow.PROJECTS_SQL+") state"
    with database.connect() as c:rows=c.execute(query).fetchall()
    projects=[{**workflow.summarize_project(r,serialize,eligibility_supplier,matrix_errors,include_current=True),'calculation':r['_evaluation']} for r in rows]
    return {'projects':sorted(projects,key=lambda p:(p['last_activity_at'],p['id']),reverse=True)}


@router.get('/reports')
def report_directory():
    with database.connect() as c:
        data=c.execute("SELECT COALESCE((SELECT jsonb_agg(x) FROM ("+PROJECT_CHOICES+") x),'[]'::jsonb) AS projects, COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC,x.id DESC) FROM (SELECT d.id,d.project_id,d.version,d.actor,d.created_at,d.snapshot->>'action' AS action,d.snapshot#>>'{supplier,name}' AS selected_supplier,d.snapshot->>'reason' AS reason,p.name AS project_name,p.project_number,(d.version=(SELECT max(v.version) FROM project_decisions v WHERE v.project_id=d.project_id)) AS latest_saved FROM project_decisions d JOIN purchasing_projects p ON p.id=d.project_id) x),'[]'::jsonb) AS reports").fetchone()
    return {'projects':choices(data['projects']),'reports':[{**r,'reference':f"PRJ-{r['project_number']:06d}"} for r in data['reports']]}


@router.get('/templates')
def templates():
    with database.connect() as c:
        data=c.execute("SELECT COALESCE((SELECT jsonb_agg(x) FROM ("+PROJECT_CHOICES+") x),'[]'::jsonb) AS projects, COALESCE((SELECT jsonb_agg(to_jsonb(t)-'request'-'created_by' ORDER BY t.updated_at DESC,t.id) FROM criteria_templates t),'[]'::jsonb) AS templates").fetchone()
    return {'projects':choices(data['projects']),'templates':[template_json(t) for t in data['templates']]}


class TemplateCreate(BaseModel):
    id:UUID
    name:str=Field(min_length=1,max_length=100)
    notes:str=Field(default='',max_length=2000)
    source_project_id:UUID
    expected_source_updated_at:datetime
    expected_criteria_revision:int=Field(ge=1)
    expected_weight_revision:int=Field(ge=0)
    include_weights:bool=False
    @field_validator('name','notes',mode='before')
    @classmethod
    def trim(cls,value):return value.strip() if isinstance(value,str) else value


class TemplateEdit(BaseModel):
    name:str=Field(min_length=1,max_length=100)
    notes:str=Field(max_length=2000)
    active:bool
    expected_version:int=Field(ge=1)
    @field_validator('name','notes',mode='before')
    @classmethod
    def trim(cls,value):return value.strip() if isinstance(value,str) else value


@router.post('/templates',status_code=201)
def create_template(payload:TemplateCreate):
    from app import require_project,CriteriaConfiguration,ManualWeightsSave
    request=payload.model_dump(mode='json')
    with database.connect() as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',('template:'+str(payload.id),))
        old=c.execute('SELECT * FROM criteria_templates WHERE id=%s',(payload.id,)).fetchone()
        if old:
            if old['request']==request and str(old['created_by'])==str(auth.actor_id()):return template_json(old)
            raise HTTPException(409,'This template identifier was already used. Refresh the library and reset the template form before starting a new save.')
        require_project(c,payload.source_project_id)
        state=project_read.load(c,payload.source_project_id,('suppliers','criteria','weights'))
        criteria=state.criteria();weight=state.get('weights');weight_revision=weight['revision'] if weight else 0
        if state.project['updated_at']!=payload.expected_source_updated_at or criteria['revision']!=payload.expected_criteria_revision or weight_revision!=payload.expected_weight_revision:
            raise HTTPException(409,'The source project changed. Refresh the library before saving a template.')
        config=CriteriaConfiguration(**criteria['configuration']).model_dump(mode='json')
        weights=None
        if payload.include_weights:
            state.eligibility()
            parsed=ManualWeightsSave(weights=weight['weights'],criteria_revision=criteria['revision'],expected_revision=weight_revision,approved=True)
            if set(parsed.weights)!={r['id'] for r in config['criteria'] if r['selected']}:raise HTTPException(422,'Approve weights for every selected criterion before including them.')
            weights={k:format(v,'.2f') for k,v in parsed.weights.items()}
        row=c.execute('INSERT INTO criteria_templates(id,name,notes,currency,configuration,weights,request,source_project_id,source_revision,created_by,actor) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *',(payload.id,payload.name,payload.notes,state.project['currency'],Jsonb(config),Jsonb(weights) if weights is not None else None,Jsonb(request),payload.source_project_id,criteria['revision'],auth.actor_id(),auth.actor_label())).fetchone()
        return template_json(row)


@router.put('/templates/{template_id}')
def edit_template(template_id:UUID,payload:TemplateEdit):
    with database.connect() as c:
        old=c.execute('SELECT * FROM criteria_templates WHERE id=%s FOR UPDATE',(template_id,)).fetchone()
        if not old:raise HTTPException(404,'Template not found.')
        if all(old[k]==getattr(payload,k) for k in ('name','notes','active')):return template_json(old)
        if old['version']!=payload.expected_version:raise HTTPException(409,'This template changed. Refresh before editing.')
        row=c.execute('UPDATE criteria_templates SET name=%s,notes=%s,active=%s,version=version+1,updated_at=clock_timestamp() WHERE id=%s RETURNING *',(payload.name,payload.notes,payload.active,template_id)).fetchone()
        return template_json(row)


@router.get('/templates/{template_id}/preview')
def preview_template(template_id:UUID,project_id:UUID):
    with database.connect() as c:
        row=c.execute("SELECT p.id,p.name,p.currency,p.updated_at,(SELECT count(*) FROM project_suppliers s WHERE s.project_id=p.id) AS supplier_count,COALESCE((SELECT revision FROM project_criteria WHERE project_id=p.id),0) AS criteria_revision,COALESCE((SELECT revision FROM project_weights WHERE project_id=p.id),0) AS weight_revision,to_jsonb(t)-'request'-'created_by' AS template FROM purchasing_projects p CROSS JOIN criteria_templates t WHERE p.id=%s AND t.id=%s",(project_id,template_id)).fetchone()
    if not row:raise HTTPException(404,'Project or template not found.')
    template=row['template']
    if not template['active']:raise HTTPException(422,'This template is archived.')
    if row['supplier_count']<2:raise HTTPException(422,'Add at least two suppliers before applying a template.')
    if row['currency']!=template['currency']:raise HTTPException(422,'Project and template currencies must match. No currency conversion is performed.')
    return {'project_id':str(row['id']),'project_name':row['name'],'project_updated_at':row['updated_at'].isoformat(),'criteria_revision':row['criteria_revision'],'weight_revision':row['weight_revision'],'template':template_json(template)}


class TemplateApply(BaseModel):
    id:UUID
    project_id:UUID
    expected_project_updated_at:datetime
    expected_criteria_revision:int=Field(ge=0)
    expected_weight_revision:int=Field(ge=0)
    expected_template_version:int=Field(ge=1)
    confirmed:Literal[True]


@router.post('/templates/{template_id}/apply')
def apply_template(template_id:UUID,payload:TemplateApply):
    from app import require_project,touch_project,CriteriaConfiguration,ManualWeightsSave
    request={**payload.model_dump(mode='json'),'template_id':str(template_id)}
    with database.connect() as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',('template-apply:'+str(payload.id),))
        require_project(c,payload.project_id)
        old=c.execute('SELECT * FROM template_applications WHERE id=%s',(payload.id,)).fetchone()
        if old:
            if old['request']==request and str(old['actor_id'])==str(auth.actor_id()):return old['result']
            raise HTTPException(409,'This application identifier was already used. Preview the template again.')
        template=c.execute('SELECT * FROM criteria_templates WHERE id=%s FOR SHARE',(template_id,)).fetchone()
        if not template:raise HTTPException(404,'Template not found.')
        if not template['active'] or template['version']!=payload.expected_template_version:raise HTTPException(409,'The template changed or was archived. Preview it again.')
        project=c.execute('SELECT * FROM purchasing_projects WHERE id=%s',(payload.project_id,)).fetchone()
        count=c.execute('SELECT count(*) AS n FROM project_suppliers WHERE project_id=%s',(payload.project_id,)).fetchone()['n']
        if count<2:raise HTTPException(422,'Add at least two suppliers before applying a template.')
        if project['currency']!=template['currency']:raise HTTPException(422,'Project and template currencies must match.')
        criteria=c.execute('SELECT * FROM project_criteria WHERE project_id=%s FOR UPDATE',(payload.project_id,)).fetchone()
        weight=c.execute('SELECT * FROM project_weights WHERE project_id=%s FOR UPDATE',(payload.project_id,)).fetchone()
        revision=criteria['revision'] if criteria else 0;weight_revision=weight['revision'] if weight else 0
        if project['updated_at']!=payload.expected_project_updated_at or revision!=payload.expected_criteria_revision or weight_revision!=payload.expected_weight_revision:
            raise HTTPException(409,'The target project changed. Preview it again before replacing criteria.')
        configuration=CriteriaConfiguration(**template['configuration']).model_dump(mode='json')
        values=template['weights'] or {r['id']:'0.00' for r in configuration['criteria'] if r['selected']}
        parsed=ManualWeightsSave(weights=values,criteria_revision=revision+1,expected_revision=weight_revision,approved=False)
        if set(parsed.weights)!={r['id'] for r in configuration['criteria'] if r['selected']}:raise HTTPException(422,'The template weights do not match its selected criteria.')
        values={k:format(v,'.2f') for k,v in parsed.weights.items()}
        c.execute('INSERT INTO project_criteria(project_id,configuration,revision) VALUES (%s,%s,%s) ON CONFLICT(project_id) DO UPDATE SET configuration=EXCLUDED.configuration,revision=EXCLUDED.revision,updated_at=clock_timestamp()',(payload.project_id,Jsonb(configuration),revision+1))
        provenance={'template_id':str(template_id),'template_version':template['version'],'applied_by':auth.actor_label(),'applied_by_id':auth.actor_id()}
        c.execute("INSERT INTO project_weights(project_id,weights,criteria_revision,revision,approved,method,provenance) VALUES (%s,%s,%s,%s,false,'manual',%s) ON CONFLICT(project_id) DO UPDATE SET weights=EXCLUDED.weights,criteria_revision=EXCLUDED.criteria_revision,revision=EXCLUDED.revision,approved=false,method='manual',provenance=EXCLUDED.provenance,updated_at=clock_timestamp()",(payload.project_id,Jsonb(values),revision+1,weight_revision+1,Jsonb(provenance)))
        touch_project(c,payload.project_id)
        result={'project_id':str(payload.project_id),'criteria_revision':revision+1,'weight_revision':weight_revision+1,'template':{'id':str(template_id),'version':template['version'],'name':template['name'],'configuration':configuration,'weights':values},'actor':auth.actor_label()}
        c.execute('INSERT INTO template_applications(id,template_id,project_id,request,result,actor_id,actor) VALUES (%s,%s,%s,%s,%s,%s,%s)',(payload.id,template_id,payload.project_id,Jsonb(request),Jsonb(result),auth.actor_id(),auth.actor_label()))
        return result
