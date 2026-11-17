"""Read-only workflow projection shared by project lists and the dashboard."""
import hashlib
import json

STATUSES=('Draft','In progress','Ready to evaluate','Evaluated','Approved','Deferred','Needs review')


def matrix_token(criteria,weights,eligible):
    return hashlib.sha256(json.dumps([criteria['revision'],criteria['currency'],weights['revision'],[(s['id'],s['updated_at'],s['revision']) for s in eligible]],default=str).encode()).hexdigest()


def derive(project,suppliers,criteria,weights,reviews,matrix,run,decision,eligibility_fn,errors_fn):
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
    return {'workflow_status':status,'workflow_stage':stage,'resume_path':path,'supplier_count':len(suppliers),
            'last_activity_at':max(activity).isoformat(),'decision_id':str(decision['id']) if decision else None}


def load_projects(connection,serialize,eligibility_fn,errors_fn):
    # Coherent snapshot without taking project write locks or recalculating scores.
    connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    projects=connection.execute('SELECT * FROM purchasing_projects').fetchall()
    if not projects:return []
    suppliers={};reviews={}
    for row in connection.execute('SELECT * FROM project_suppliers ORDER BY created_at,id').fetchall():suppliers.setdefault(row['project_id'],[]).append(row)
    for row in connection.execute('SELECT * FROM supplier_reviews').fetchall():reviews[row['supplier_id']]=row
    def indexed(query):return {r['project_id']:r for r in connection.execute(query).fetchall()}
    criteria=indexed('SELECT * FROM project_criteria');weights=indexed('SELECT * FROM project_weights');matrices=indexed('SELECT * FROM project_matrix')
    runs=indexed('SELECT DISTINCT ON (project_id) * FROM ranking_runs ORDER BY project_id,created_at DESC,id DESC')
    decisions=indexed('SELECT DISTINCT ON (project_id) * FROM project_decisions ORDER BY project_id,version DESC')
    result=[]
    for p in projects:
        pid=p['id'];result.append({**serialize(p),**derive(p,suppliers.get(pid,[]),criteria.get(pid),weights.get(pid),reviews,matrices.get(pid),runs.get(pid),decisions.get(pid),eligibility_fn,errors_fn)})
    return sorted(result,key=lambda p:(p['last_activity_at'],p['id']),reverse=True)
