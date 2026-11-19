"""Read-only workflow projection shared by project lists and the dashboard."""
import hashlib
import json
from datetime import datetime
from uuid import UUID

STATUSES=('Draft','In progress','Ready to evaluate','Evaluated','Approved','Deferred','Needs review')


def matrix_token(criteria,weights,eligible):
    return hashlib.sha256(json.dumps([criteria['revision'],criteria['currency'],weights['revision'],[(s['id'],s['updated_at'],s['revision']) for s in eligible]],default=str).encode()).hexdigest()


def derive(project,suppliers,criteria,weights,reviews,matrix,run,decision,eligibility_fn,errors_fn,*,include_current=False):
    prefix='/projects/'+str(project['id'])
    stage='Suppliers';path=prefix+'/suppliers';status='Draft' if len(suppliers)<2 else 'In progress'
    ready=False;run_current=False
    if len(suppliers)>=2:
        stage='Criteria';path=prefix+'/criteria'
        if criteria:
            criteria={**criteria,'currency':project['currency']}
            selected=[c for c in criteria['configuration']['criteria'] if c['selected']]
            method=weights['method'] if weights else 'manual'
            stage='Weights';path=prefix+'/weights/'+method
            approved=bool(weights and weights['approved'] and weights['criteria_revision']==criteria['revision'])
            if approved and method=='ai':
                from ai_weighting import fingerprint,input_context
                approved=weights['provenance'].get('context')==fingerprint(input_context(project['category'],selected),criteria['revision'])
            if approved:
                stage='Eligibility';path=prefix+'/eligibility'
                eligible=[eligibility_fn(s,reviews.get(s['id']),criteria) for s in suppliers]
                eligible=[s for s in eligible if s['eligibility']=='eligible']
                if len(eligible)>=2:
                    stage='Evaluation matrix';path=prefix+'/matrix'
                    token=matrix_token(criteria,weights,eligible)
                    ready=bool(matrix and matrix['context']==token and not errors_fn(matrix['entries'],eligible,selected,criteria['configuration']['maximum_price']))
                    if ready:
                        status='Ready to evaluate'
                        run_current=bool(run and run['context']==token and run['matrix_revision']==matrix['revision'])
                        if run_current:
                            status='Evaluated';stage='Decision';path=prefix+'/decision'
    if decision:
        if run_current and decision['ranking_id']==run['id']:
            status='Deferred' if decision['snapshot']['action']=='defer' else 'Approved'
            stage='Decision';path=prefix+'/decision'
        else:status='Needs review'
    elif run and not run_current:status='Needs review'
    activity=[project['updated_at']]
    for row,field in [(criteria,'updated_at'),(weights,'updated_at'),(matrix,'updated_at'),(run,'created_at'),(decision,'created_at')]:
        if row and row.get(field):activity.append(row[field])
    result = {'workflow_status':status,'workflow_stage':stage,'resume_path':path,'supplier_count':len(suppliers),
            'last_activity_at':max(activity).isoformat(),'decision_id':str(decision['id']) if decision else None}
    if include_current:result['evaluation_current']=run_current
    return result


# A single statement uses one MVCC snapshot and avoids one cloud round trip per table.
PROJECTS_SQL = """
SELECT p.*,
    COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at,s.id)
        FROM project_suppliers s WHERE s.project_id=p.id),'[]'::jsonb) AS _suppliers,
    COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM supplier_reviews r
        JOIN project_suppliers s ON s.id=r.supplier_id WHERE s.project_id=p.id),'[]'::jsonb) AS _reviews,
    (SELECT to_jsonb(c) FROM project_criteria c WHERE c.project_id=p.id) AS _criteria,
    (SELECT jsonb_build_object('revision',w.revision,'criteria_revision',w.criteria_revision,
        'approved',w.approved,'method',w.method,'updated_at',w.updated_at,
        'provenance',jsonb_build_object('context',w.provenance->'context'))
        FROM project_weights w WHERE w.project_id=p.id) AS _weights,
    (SELECT jsonb_build_object('context',m.context,'revision',m.revision,
        'entries',m.entries,'updated_at',m.updated_at)
        FROM project_matrix m WHERE m.project_id=p.id) AS _matrix,
    (SELECT jsonb_build_object('id',r.id,'context',r.context,
        'matrix_revision',r.matrix_revision,'created_at',r.created_at)
        FROM ranking_runs r WHERE r.project_id=p.id
        ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS _run,
    (SELECT jsonb_build_object('id',d.id,'ranking_id',d.ranking_id,'created_at',d.created_at,
        'snapshot',jsonb_build_object('action',d.snapshot->'action'))
        FROM project_decisions d WHERE d.project_id=p.id
        ORDER BY d.version DESC LIMIT 1) AS _decision
FROM purchasing_projects p
"""


def _record(value):
    if value is None:
        return None
    row = dict(value)
    # JSON aggregates keep nested evaluation values as JSON, while row-level IDs
    # and timestamps must have the same types as ordinary Psycopg query results.
    for key in ('id','project_id','supplier_id','ranking_id'):
        if row.get(key) is not None:
            row[key] = UUID(row[key])
    for key in ('created_at','updated_at','supplier_updated_at'):
        if row.get(key) is not None:
            row[key] = datetime.fromisoformat(row[key])
    return row


def summarize_project(row,serialize,eligibility_fn,errors_fn,*,include_current=False):
    suppliers = [_record(s) for s in row['_suppliers']]
    parsed_reviews = [_record(r) for r in row['_reviews']]
    reviews = {r['supplier_id']:r for r in parsed_reviews}
    state = derive(row,suppliers,_record(row['_criteria']),_record(row['_weights']),
        reviews,_record(row['_matrix']),_record(row['_run']),_record(row['_decision']),
        eligibility_fn,errors_fn,include_current=include_current)
    return {**serialize(row),**state}


def load_projects(connection,serialize,eligibility_fn,errors_fn):
    result = [summarize_project(row,serialize,eligibility_fn,errors_fn)
              for row in connection.execute(PROJECTS_SQL).fetchall()]
    return sorted(result,key=lambda p:(p['last_activity_at'],p['id']),reverse=True)
