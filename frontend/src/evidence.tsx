import {useEffect,useRef,useState} from 'react';
import {api} from './api';
type Document={id:string;filename:string;size_bytes:number;sha256:string;check_id:string|null;check_name:string|null;created_at:string;uploaded_by:string};
type Files={files:Document[];evidence_revision:number;limits:{used_bytes:number;max_bytes:number;file_max_bytes:number;active_limit:number;stored_files:number;stored_file_limit:number}};
export function EvidenceFiles({readOnly=false,projectId,supplier,criteriaRevision,checks,onChanged,onBusy}:{readOnly?:boolean;projectId:string;supplier:{id:string;updated_at:string;evidence_revision?:number};criteriaRevision:number;checks:{id:string;name:string}[];onChanged:(revision:number)=>Promise<void>;onBusy:(busy:boolean)=>void}){
 const base=`/api/projects/${projectId}/suppliers/${supplier.id}/evidence`;
 const [data,setData]=useState<Files|null>(null),[file,setFile]=useState<File|null>(null),[check,setCheck]=useState(''),[uploadId,setUploadId]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const input=useRef<HTMLInputElement>(null);
 async function load(){setError('');try{const d=await api<Files>(base);if(!Array.isArray(d.files))throw Error('File listing unavailable.');setData(d);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[base,supplier.evidence_revision]);
 function working(value:boolean){setBusy(value);onBusy(value);}
 async function upload(){if(!file||busy)return;working(true);setError('');setNotice('');try{
 const params=new URLSearchParams({filename:file.name,criteria_revision:String(criteriaRevision),supplier_updated_at:supplier.updated_at,evidence_revision:String(supplier.evidence_revision||0)});if(check)params.set('check_id',check);
 const response=await api<{file:Document;evidence_revision:number}>(`${base}/${uploadId}?${params}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(60000)});
 setFile(null);if(input.current)input.current.value='';setUploadId(crypto.randomUUID());await onChanged(response.evidence_revision);setNotice('Document uploaded and saved in cloud storage. Review any affected eligibility findings again.');await load();
 }catch(e){setError((e as Error).message);}finally{working(false);}}
 async function remove(document:Document){if(!confirm(`Remove ${document.filename} from current evidence? It will remain available to historical reports.`))return;
 working(true);setError('');setNotice('');try{const r=await api<{evidence_revision:number}>(`${base}/${document.id}?evidence_revision=${supplier.evidence_revision||0}`,{method:'DELETE'});await onChanged(r.evidence_revision);setNotice('Document removed from current evidence. Historical copies are retained.');await load();}catch(e){setError((e as Error).message);}finally{working(false);}}
 async function download(document:Document){working(true);setError('');try{
 const response=await fetch(`${base}/${document.id}/content`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Document download failed. Please retry.');
 const url=URL.createObjectURL(await response.blob());const link=window.document.createElement('a');link.href=url;link.download=document.filename;window.document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){setError((e as Error).message);}finally{working(false);}}
 const stale=data&&data.evidence_revision!==(supplier.evidence_revision||0);
 return <section className="evidence-files"><h3>Evidence documents</h3><p>PDF or UTF-8 text, up to 2 MiB per file. Use synthetic demonstration documents. Uploads and removals save immediately; Cancel only discards unsaved review notes.</p><p><a href="/samples/SDSS-synthetic-evidence-example.txt" download>Download an example text document</a></p>
 {error&&<p className="error" role="alert">{error}<button disabled={busy} onClick={()=>void load()}>Retry file list</button></p>}{notice&&<p className="success" role="status">{notice}</p>}{stale&&<p className="error">Files changed in another window. Cancel and refresh the review before changing files or saving findings.</p>}
 {data&&<><p>{data.files.length} / {data.limits.active_limit} active supplier files · {(data.limits.used_bytes/1024/1024).toFixed(2)} / {(data.limits.max_bytes/1024/1024).toFixed(0)} MiB retained in this project. Archived files count toward storage.</p>
 <ul>{data.files.map(document=><li key={document.id}><strong>{document.filename}</strong> · {(document.size_bytes/1024).toFixed(1)} KiB · {document.check_name||'General supplier evidence'}<small className="review-meta">Uploaded {new Date(document.created_at).toLocaleString()} by {document.uploaded_by}</small><button className="secondary" disabled={busy} onClick={()=>void download(document)}>Download {document.filename}</button>{!readOnly&&<button className="secondary" disabled={busy||!!stale} onClick={()=>void remove(document)}>Remove {document.filename}</button>}</li>)}</ul>
 {!data.files.length&&<p>No active documents uploaded for this supplier.</p>}
 {!readOnly&&<><label>Link upload to requirement<select aria-label="Link upload to requirement" disabled={busy} value={check} onChange={e=>{setCheck(e.target.value);setUploadId(crypto.randomUUID());}}><option value="">General supplier evidence</option>{checks.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>Choose evidence document<input ref={input} type="file" accept=".pdf,.txt,application/pdf,text/plain" disabled={busy} onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);setUploadId(crypto.randomUUID());setError(f&&f.size>data.limits.file_max_bytes?'Each document must be 2 MiB or smaller.':'');}}/></label>
 <button className="primary" disabled={busy||!!stale||!file||file.size>data.limits.file_max_bytes||data.files.length>=data.limits.active_limit} onClick={()=>void upload()}>{busy?'Working…':'Upload Document'}</button></>}</>}
 </section>;
}
