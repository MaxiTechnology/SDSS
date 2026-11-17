import { EvidenceFiles } from './evidence';
import {useEffect, useRef, useState} from 'react';
import {api} from './api';

type Determination={status:'pending'|'passed'|'failed';notes:string};
type Supplier={evidence_revision?:number;id:string;name:string;updated_at:string;checks:Record<string,Determination>;total_price:string|null;price_status:string|null;eligibility:string;revision:number;needs_review:boolean;reviewer:string|null;reviewed_at:string|null};
type Saved={weight_method?:string;suppliers:Supplier[];mandatory_checks:{id:string;name:string;requirement:string}[];maximum_price:string|null;currency:string;criteria_revision:number;eligible_count:number;ready:boolean};

export function Eligibility({projectId}:{projectId:string}){
 const base=`/api/projects/${projectId}/eligibility`;
 const [saved,setSaved]=useState<Saved|null>(null),[active,setActive]=useState<Supplier|null>(null),[checks,setChecks]=useState<Record<string,Determination>>({}),[price,setPrice]=useState('');
 const [filesBusy,setFilesBusy]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 const dirty=!!active&&(JSON.stringify(checks)!==JSON.stringify(active.checks)||price!==(active.total_price??''));
 async function load(){setBusy(true);setError('');try{setSaved(await api<Saved>(base));}catch(e){setError(e instanceof Error?e.message:'Could not load eligibility.');}finally{setBusy(false);}}
 useEffect(()=>{void load();},[projectId]);
 useEffect(()=>{if(active&&!dialog.current?.open)dialog.current?.showModal();},[active]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
 function close(){if(busy||filesBusy)return;if(dirty&&!confirm('Discard unsaved review changes?'))return;dialog.current?.close();setActive(null);setError('');}
 async function save(){if(!saved||!active||busy||filesBusy)return;setBusy(true);setError('');try{
  const row=await api<Supplier>(`${base}/${active.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({evidence_revision:active.evidence_revision||0,checks,currency:saved.currency,total_price:price||null,criteria_revision:saved.criteria_revision,supplier_updated_at:active.updated_at,expected_revision:active.revision})});
  const suppliers=saved.suppliers.map(s=>s.id===row.id?row:s),eligible_count=suppliers.filter(s=>s.eligibility==='eligible').length;
  setSaved({...saved,suppliers,eligible_count,ready:eligible_count>=2});dialog.current?.close();setActive(null);setNotice(`Review saved for ${row.name}.`);
 }catch(e){setError(e instanceof Error?e.message:'Saving failed. Your entries are kept.');}finally{setBusy(false);}}
 if(!saved)return <section><p role="alert">{error||'Loading eligibility…'}</p><button className="secondary" disabled={busy} onClick={()=>void load()}>Reload</button>
 <button className="secondary" onClick={()=>location.hash=`/projects/${projectId}/criteria`}>Back to Criteria</button></section>;
 const valid=Object.values(checks).every(c=>c.status==='pending'||!!c.notes.trim())&&(!price||/^\d+(\.\d{1,2})?$/.test(price));
 return <section className="supplier-page eligibility-page">
 <div className="card-heading"><div><h2>Supplier Eligibility Review</h2><p>Only suppliers who pass every mandatory requirement qualify for scoring.</p></div><span className="chip">{saved.eligible_count} eligible · {saved.suppliers.length-saved.eligible_count} excluded or pending</span></div>
 <p className="info">Missing or unreviewed requirements remain Pending. Failed requirements make a supplier Ineligible. At least two eligible suppliers are required for comparison.</p>
 <p className="supplier-note">Local demonstration: review notes and decisions are saved as Demo User. Evidence files are saved in the cloud. Reviews are unauthenticated; use synthetic demonstration files.</p>
 {error&&!active&&<p role="alert" className="error">{error}</p>}
 {notice&&<p role="status" className="success">{notice}</p>}
 {!saved.mandatory_checks.length&&saved.maximum_price===null&&<p className="info">No mandatory requirements are configured. All current suppliers qualify without evidence checks. Add requirements on the Criteria page if needed.</p>}
 <div className="table-scroll"><table><thead><tr><th>Supplier</th><th>Mandatory checks</th><th>Eligibility</th><th>Review</th></tr></thead><tbody>{saved.suppliers.map(s=><tr key={s.id}><td><strong>{s.name}</strong>{s.needs_review&&<p>Supplier or criteria changed. Review again.</p>}</td><td>{Object.values(s.checks).filter(c=>c.status==='passed').length} / {saved.mandatory_checks.length} checks passed{saved.maximum_price!==null&&<p>Price limit: {s.price_status}</p>}</td><td><span className={`chip status-${s.eligibility}`}>{s.eligibility}</span></td><td><button className="secondary" onClick={()=>{setActive(s);setChecks(structuredClone(s.checks));setPrice(s.total_price??'');setError('');}}>Review {s.name}</button>{s.reviewed_at&&<small className="review-meta">{s.reviewer}<br/>{new Date(s.reviewed_at).toLocaleString()}</small>}</td></tr>)}</tbody></table></div>
 <p role="status" className={saved.ready?'success':'error'}>{saved.ready?'Minimum eligible pool met.':'At least two suppliers must qualify before evaluation.'}</p>
 <button className="primary" disabled={!saved.ready||busy} onClick={()=>location.hash=`/projects/${projectId}/matrix`}>Continue to Evaluation Matrix →</button>
 <button className="secondary" onClick={()=>location.hash=`/projects/${projectId}/weights/${saved.weight_method==='ahp'?'ahp':saved.weight_method==='ai'?'ai':'manual'}`}>← Back to {saved.weight_method==='ahp'?'AHP':saved.weight_method==='ai'?'AI':'Manual'} Weighting</button> <button className="secondary" onClick={()=>void load()} disabled={busy}>Refresh Reviews</button>
 <dialog ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-labelledby="review-title">
 <div className="dialog-heading"><h2 id="review-title">Review: {active?.name}</h2><button aria-label="Close review" disabled={busy||filesBusy} onClick={close}>×</button></div>
 <div className="dialog-body project-form review-form">
 {error&&<p role="alert" className="error">{error} Cancel and refresh to load newer records.</p>}
 <fieldset disabled={busy||filesBusy}>{saved.mandatory_checks.map(c=><section className="review-check" key={c.id}><h3>{c.name}</h3><p>{c.requirement}</p><label>Determination for {c.name}<select value={checks[c.id]?.status??'pending'} onChange={e=>setChecks({...checks,[c.id]:{...checks[c.id],status:e.target.value as Determination['status']}})}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label><label>Review notes for {c.name}<textarea maxLength={2000} value={checks[c.id]?.notes??''} onChange={e=>setChecks({...checks,[c.id]:{...checks[c.id],notes:e.target.value}})}/></label><small>For Passed or Failed, describe the evidence reviewed and your finding.</small></section>)}
 {saved.maximum_price!==null&&<section className="review-check"><h3>Maximum acceptable total price</h3><p>Limit: {saved.maximum_price} {saved.currency}. Equal to the limit is allowed.</p><label>Supplier total price ({saved.currency})<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label><small>Leave empty for Pending. A price above the limit automatically fails.</small></section>}
 {!saved.mandatory_checks.length&&saved.maximum_price===null&&<p>No mandatory requirements to review.</p>}</fieldset>
 <fieldset disabled={busy}>{active&&<EvidenceFiles key={active.id} projectId={projectId} supplier={active} criteriaRevision={saved.criteria_revision} checks={saved.mandatory_checks} onBusy={setFilesBusy} onChanged={async revision=>{
 setActive(current=>current?{...current,evidence_revision:revision,needs_review:true}:current);
 setNotice('Evidence changed. Review affected findings before saving.');
 await api<Saved>(base).then(setSaved).catch(()=>setError('Evidence was saved, but eligibility could not be refreshed. Cancel and refresh the review.'));
 }}/>}</fieldset>
 </div><div className="dialog-footer"><button className="secondary" disabled={busy||filesBusy} onClick={close}>Cancel</button><button className="primary" disabled={busy||filesBusy||!valid} onClick={()=>void save()}>{busy?'Saving…':'Save Review'}</button></div></dialog>
 </section>;
}

