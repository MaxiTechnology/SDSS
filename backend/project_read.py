"""One-statement snapshots for project GET pages; write paths keep their locks."""
from fastapi import HTTPException
from workflow import _record,matrix_token

FIELDS={
 'suppliers':"COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at,s.id) FROM project_suppliers s WHERE s.project_id=p.id),'[]'::jsonb)",
 'reviews':"COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM supplier_reviews r JOIN project_suppliers s ON s.id=r.supplier_id WHERE s.project_id=p.id),'[]'::jsonb)",
 'criteria':"(SELECT to_jsonb(c) FROM project_criteria c WHERE c.project_id=p.id)",
 'weights':"(SELECT to_jsonb(w) FROM project_weights w WHERE w.project_id=p.id)",
 'matrix':"(SELECT to_jsonb(m) FROM project_matrix m WHERE m.project_id=p.id)",
 'run':"(SELECT to_jsonb(r) FROM ranking_runs r WHERE r.project_id=p.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1)",
 'run_head':"(SELECT jsonb_build_object('id',r.id,'context',r.context,'matrix_revision',r.matrix_revision,'created_at',r.created_at) FROM ranking_runs r WHERE r.project_id=p.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1)",
 'history':"COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.version DESC) FROM project_decisions d WHERE d.project_id=p.id),'[]'::jsonb)",
 'legacy_basis':"(SELECT jsonb_build_object('currency',r.snapshot->'currency','criteria',COALESCE(r.snapshot->'criteria','[]'::jsonb)) FROM ranking_runs r JOIN project_matrix m ON m.project_id=r.project_id AND m.context=r.context AND m.revision=r.matrix_revision WHERE r.project_id=p.id AND COALESCE(m.input_basis,'{}'::jsonb)='{}'::jsonb LIMIT 1)",
 'ahp':"(SELECT to_jsonb(a) FROM project_ahp a WHERE a.project_id=p.id)",
 'ai_draft':"(SELECT to_jsonb(a) FROM project_ai_drafts a WHERE a.project_id=p.id)",
 'ai_suggestion':"(SELECT to_jsonb(s) FROM project_ai_suggestions s JOIN project_ai_drafts d ON d.suggestion_id=s.id AND d.project_id=s.project_id WHERE s.project_id=p.id)"
}
MATRIX_PARTS=('suppliers','reviews','criteria','weights','matrix')

class ProjectRead:
    def __init__(self,project,rows):self.project=project;self.rows=rows
    def get(self,key):return self.rows.get(key)
    def criteria(self,*,saved=True):
        if len(self.get('suppliers'))<2:raise HTTPException(422,'Add at least two suppliers before configuring criteria.')
        row=self.get('criteria')
        if row is None:
            if saved:raise HTTPException(422,'Save your criteria before assigning weights.')
            return None
        return {**row,'currency':self.project['currency']}
    def eligibility(self):
        criteria=self.criteria();weights=self.get('weights')
        if not weights or not weights['approved'] or weights['criteria_revision']!=criteria['revision']:
            raise HTTPException(422,'Approve weights for the current criteria before reviewing eligibility.')
        if weights['method']=='ai':
            from ai_weighting import fingerprint,input_context
            selected=[c for c in criteria['configuration']['criteria'] if c['selected']]
            if weights['provenance'].get('context')!=fingerprint(input_context(self.project['category'],selected),criteria['revision']):
                raise HTTPException(422,'AI context changed. Request and approve current AI weights or switch to Manual/AHP weighting.')
        return criteria
    def eligibility_rows(self,eligibility_fn,criteria):
        reviews={r['supplier_id']:r for r in self.get('reviews')}
        return [eligibility_fn(s,reviews.get(s['id']),criteria) for s in self.get('suppliers')]
    def matrix_context(self,eligibility_fn):
        criteria=self.eligibility()
        eligible=[s for s in self.eligibility_rows(eligibility_fn,criteria) if s['eligibility']=='eligible']
        if len(eligible)<2:raise HTTPException(422,'At least two eligible suppliers are required for the evaluation matrix.')
        selected=[c for c in criteria['configuration']['criteria'] if c['selected']]
        return criteria,eligible,selected,matrix_token(criteria,self.get('weights'),eligible)


def load(connection,project_id,parts):
    # Names are fixed internal constants, never request-provided SQL identifiers.
    columns=['p.*']+[FIELDS[name]+' AS _'+name for name in parts]
    row=connection.execute('SELECT '+', '.join(columns)+' FROM purchasing_projects p WHERE p.id=%s',(project_id,)).fetchone()
    if row is None:raise HTTPException(404,'Project not found.')
    values={}
    for name in parts:
        value=row['_'+name]
        values[name]=[_record(r) for r in value] if name in ('suppliers','reviews','history') else _record(value)
    return ProjectRead({k:v for k,v in row.items() if not k.startswith('_')},values)
