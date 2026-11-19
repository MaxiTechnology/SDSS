import {useAuth} from './auth';
import {useEffect,useState} from 'react';
import {api} from './api';
import type {Run} from './rankings';
type Decision={id:string;ranking_id:string;version:number;stale:boolean;actor:string;created_at:string;snapshot:{action:string;supplier:{name:string;rank:number;score:string}|null;reason:string;revision_reason:string}};
const labels:Record<string,string>={approve:'Recommended supplier approved',alternative:'Alternative supplier approved',defer:'Purchase deferred'};
export function FinalDecision({projectId}:{projectId:string}){
 const canApprove=useAuth().user.role!=='officer';
 const [run,setRun]=useState<Run|null>(null),[history,setHistory]=useState<Decision[]>([]),[loaded,setLoaded]=useState(false),[editing,setEditing]=useState(false);
 const [action,setAction]=useState('approve'),[supplier,setSupplier]=useState(''),[reason,setReason]=useState(''),[revisionReason,setRevisionReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 useEffect(()=>{Promise.all([api<Run>(`/api/projects/${projectId}/rankings`),api<{decisions:Decision[]}>(`/api/projects/${projectId}/decisions`)]).then(([r,h])=>{setRun(r);if(r.snapshot.result.rows.filter(row=>row.rank===1).length!==1)setAction('alternative');setHistory(h.decisions);setLoaded(true);}).catch(e=>setError(e.message));},[projectId]);
 const latest=history[0],rows=run?.snapshot.result.rows||[],leaders=rows.filter(r=>r.rank===1),unique=leaders.length===1;
 const canEdit=canApprove&&loaded&&run&&!run.stale&&(!latest||editing);
 function change(){setConfirmed(false);setRequestId(crypto.randomUUID());}
 async function save(){if(!run)return;setBusy(true);setError('');try{
  const saved=await api<Decision>(`/api/projects/${projectId}/decisions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId,ranking_id:run.id,expected_version:latest?.version||0,action,supplier_id:action==='defer'?null:action==='approve'?leaders[0]?.id:supplier,reason,revision_reason:revisionReason,confirmed})});
  setHistory([saved,...history]);setEditing(false);setConfirmed(false);setReason('');setRevisionReason('');setRequestId(crypto.randomUUID());
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="supplier-page decision-page"><h2>Final Purchasing Decision</h2><p className="info">Confirmations record your signed-in identity. A simulation does not change the approved ranking or award a supplier.</p>
 {!canApprove&&<p className="info">An Approver or Administrator must confirm the final decision.</p>}
 {error&&<p role="alert" className="error">{error}</p>}
 {run?.stale&&<p role="alert" className="error">Rankings are out of date. Review inputs and calculate again before confirming a decision.</p>}
 {latest&&<article><h3>{labels[latest.snapshot.action]} — version {latest.version}</h3>{latest.stale&&<p className="error">This historical decision needs review because the evaluation has changed.</p>}
 <p>{latest.snapshot.supplier?`Selected supplier: ${latest.snapshot.supplier.name}`:'No supplier was awarded.'}</p><p>{latest.snapshot.reason}</p><p>Confirmed by {latest.actor} on {new Date(latest.created_at).toLocaleString()}.</p>
 <p><button className="primary" onClick={()=>location.hash=`/projects/${projectId}/reports/${latest.id}`}>View Decision Report</button></p>
 {canApprove&&!editing&&<button className="secondary" disabled={!run||run.stale} onClick={()=>{setEditing(true);change();}}>Create a decision revision</button>}</article>}
 {canEdit&&<fieldset disabled={busy} style={{border:0,padding:0}}><legend>{latest?'Revise confirmed decision':'Choose your decision'}</legend>
 <p>{unique?`Highest-ranked supplier: ${leaders[0].name}.`:'The highest score is tied. Select a supplier and explain your choice.'}</p>
 <label>Decision<select aria-label="Decision" value={action} onChange={e=>{setAction(e.target.value);change();}}><option value="approve" disabled={!unique}>Approve recommended supplier</option><option value="alternative">Choose another supplier / resolve a tie</option><option value="defer">Defer purchase</option></select></label>
 {action==='alternative'&&<label>Eligible supplier<select aria-label="Eligible supplier" value={supplier} onChange={e=>{setSupplier(e.target.value);change();}}><option value="">Select a supplier</option>{rows.filter(r=>!unique||r.rank!==1).map(r=><option key={r.id} value={r.id}>{r.name} (rank {r.rank})</option>)}</select></label>}
 <label>{action==='approve'?'Decision notes (optional)':'Reason (required)'}<textarea aria-label="Decision reason" maxLength={5000} value={reason} onChange={e=>{setReason(e.target.value);change();}} /></label>
 {latest&&<label>Reason for revising the decision (required)<textarea aria-label="Revision reason" maxLength={5000} value={revisionReason} onChange={e=>{setRevisionReason(e.target.value);change();}} /></label>}
 <p><label className="inline-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I have reviewed the ranking and confirm this purchasing decision.</label></p>
 <button className="primary" disabled={!confirmed||(action==='approve'&&!unique)||(action==='alternative'&&!supplier)||(action!=='approve'&&!reason.trim())||Boolean(latest&&!revisionReason.trim())} onClick={save}>{busy?'Saving…':'Confirm Decision'}</button>
 {editing&&<button className="secondary" onClick={()=>setEditing(false)}>Cancel revision</button>}</fieldset>}
 {history.length>0&&<details><summary>Decision history ({history.length})</summary>{history.map(d=><article key={d.id}><h4>Version {d.version}: {labels[d.snapshot.action]}</h4><p>{d.snapshot.supplier?.name||'No award'} · {new Date(d.created_at).toLocaleString()} · {d.actor}</p><p>{d.snapshot.reason}</p><button className="secondary" onClick={()=>location.hash=`/projects/${projectId}/reports/${d.id}`}>View report for version {d.version}</button>{d.snapshot.revision_reason&&<p>Revision reason: {d.snapshot.revision_reason}</p>}</article>)}</details>}
 <p><button className="secondary" onClick={()=>location.hash=`/projects/${projectId}/rankings`}>← Back to Rankings</button></p></section>;
}
