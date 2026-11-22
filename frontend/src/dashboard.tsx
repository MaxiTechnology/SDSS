import {useLayoutEffect,useRef,useState} from 'react';

export const WORKFLOW_STATUSES=['Draft','In progress','Ready to evaluate','Evaluated','Approved','Deferred','Needs review'];
type Project={id:string;name:string;reference:string;status:string;workflow_status?:string;workflow_stage?:string;resume_path?:string;supplier_count?:number;last_activity_at?:string;updated_at:string;decision_id?:string|null};
export function Dashboard({projects,onFilter,onOpen,onReport,onRefresh}:{projects:Project[];onFilter:(status:string)=>void;onOpen:(project:Project)=>void;onReport:(project:Project)=>void;onRefresh:()=>void}){
 const activityRef=useRef<HTMLDivElement>(null),[activityOverflows,setActivityOverflows]=useState(false);
 const hasProjects=projects.length>0;
 useLayoutEffect(()=>{
  const region=activityRef.current;if(!region)return;
  const table=region.querySelector('table');if(!table)return;
  const update=()=>setActivityOverflows(region.scrollWidth>region.clientWidth);
  const resize=new ResizeObserver(update),content=new MutationObserver(update);
  resize.observe(region);resize.observe(table);content.observe(table,{childList:true,subtree:true,characterData:true});
  update();return ()=>{resize.disconnect();content.disconnect();};
 },[hasProjects]);
 const count=(status:string)=>projects.filter(p=>(p.workflow_status||p.status)===status).length;
 return <section className="dashboard"><button className="secondary" onClick={onRefresh}>Refresh dashboard</button><p className="info">Totals from the latest loaded saved projects. Approval status reflects the latest decision and whether its evaluation is still current.</p>
 <div className="dashboard-cards"><button onClick={()=>onFilter('All')}><span>All projects</span><strong>{projects.length}</strong></button>{['Approved','Deferred','Needs review'].map(status=><button key={status} onClick={()=>onFilter(status)}><span>{status}</span><strong>{count(status)}</strong></button>)}<div><span>Supplier entries</span><strong>{projects.reduce((n,p)=>n+(p.supplier_count||0),0)}</strong></div></div>
 <h2>Workflow overview</h2><div className="workflow-counts">{WORKFLOW_STATUSES.map(status=><button className="secondary" key={status} onClick={()=>onFilter(status)}>{status}: {count(status)}</button>)}</div>
 <h2>Recent project activity</h2>{!projects.length?<div className="empty"><p>No saved projects yet. Create a purchasing project to begin.</p></div>:<div className="dashboard-activity">{activityOverflows&&<p id="dashboard-activity-hint" className="dashboard-activity-hint">Scroll horizontally to see more project activity and actions.</p>}<div ref={activityRef} className="table-card table-scroll" role="region" aria-label="Recent project activity table" aria-describedby={activityOverflows?'dashboard-activity-hint':undefined} tabIndex={0}><table><thead><tr><th>Project</th><th>Status</th><th>Next stage</th><th>Last activity</th><th>Actions</th></tr></thead><tbody>{projects.slice(0,6).map(p=><tr key={p.id}><td><strong>{p.name}</strong><small className="supplier-note">{p.reference}</small></td><td><span className="chip" data-status={p.workflow_status||p.status}>{p.workflow_status||p.status}</span></td><td>{p.workflow_stage||'Project details'}</td><td>{new Date(p.last_activity_at||p.updated_at).toLocaleString()}</td><td><div className="dashboard-activity-actions"><button className="primary" onClick={()=>onOpen(p)}>Continue Workflow</button>{p.decision_id&&<button className="secondary" onClick={()=>onReport(p)}>Saved Report</button>}</div></td></tr>)}</tbody></table></div></div>}
 <p><button className="secondary" onClick={()=>onFilter('All')}>View all purchasing projects</button></p></section>;
}
