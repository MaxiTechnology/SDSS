import {useAuth} from './auth';
import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './api';
import {useRecommendationCache} from './page-reads';
export type Run={id:string;created_at:string;stale:boolean;snapshot:{method:string;criteria:{id:string;name:string}[];weights:Record<string,string>;result:{rows:{id:string;name:string;score:string;rank:number}[]}}};
type Recommendation={
 ranking_id:string;
 ranking_stale:boolean;
 recommendation_type:'supplier'|'tie';
 recommended_supplier:string|null;
 ranking_position:number|null;
 topsis_score:string|null;
 next_best_supplier:string|null;
 next_best_score:string|null;
 key_reasons:string[];
 supplier_comparison:string;
 decision:string;
};
export function Rankings({projectId}:{projectId:string}){
 const canPrepare=useAuth().user.role!=='approver';
 const [run,setRun]=useState<Run|null>(null),[error,setError]=useState('');
 const [recommendation,setRecommendation]=useState<Recommendation|null>(null);
 const [recommendationError,setRecommendationError]=useState('');
 const [generating,setGenerating]=useState(false);
 const cache=useRecommendationCache<Recommendation>();
 const requestVersion=useRef(0);
 useEffect(()=>{
  let active=true;
  async function load(){
   const version=++requestVersion.current;
   setRun(null);setRecommendation(null);setError('');setRecommendationError('');setGenerating(false);
   try{
    const current=await api<Run>(`/api/projects/${projectId}/rankings`);
    if(!active||version!==requestVersion.current)return;
    const saved=cache.get(projectId);
    if(current.stale||saved?.ranking_id!==current.id)cache.delete(projectId);
    setRun(current);
    if(!current.stale&&saved?.ranking_id===current.id)setRecommendation(saved);
   }catch(e){if(active&&version===requestVersion.current)setError(e instanceof Error?e.message:'Could not load the rankings.');}
  }
  void load();
  const refresh=()=>{if(document.visibilityState==='visible')void load();};
  window.addEventListener('focus',refresh);
  return()=>{active=false;requestVersion.current++;window.removeEventListener('focus',refresh);};
 },[projectId,cache]);
 async function generateRecommendation(){
  if(!run||run.stale||generating)return;
  const version=requestVersion.current;
  setGenerating(true);setRecommendationError('');setRecommendation(null);
  try{
   const result=await api<Recommendation>(`/api/projects/${projectId}/rankings/recommendation`,{method:'POST',signal:AbortSignal.timeout(45000)});
   if(version!==requestVersion.current)return;
   if(result.ranking_id!==run.id||result.ranking_stale){cache.delete(projectId);setRun({...run,stale:true});setRecommendationError('The ranking changed. Recalculate rankings before generating a new recommendation.');}
   else{cache.set(projectId,result);setRecommendation(result);}
  }catch(e){if(version===requestVersion.current){if(e instanceof ApiError&&e.status===409){cache.delete(projectId);setRun({...run,stale:true});}setRecommendationError(e instanceof Error?e.message:'Could not generate the AI recommendation.');}}
  finally{if(version===requestVersion.current)setGenerating(false);}
 }
 return <section className="supplier-page rankings-page"><h2>Ranking results</h2>{error&&<p role="alert" className="error">{error}</p>}{run&&<>
 <div className="rankings-summary">
 {run.stale?<p role="alert" className="error">These rankings are out of date. Review the matrix and calculate again before using them.</p>:<p className="success">{run.snapshot.result.rows.filter(r=>r.rank===1).length>1?'The highest score is tied. No single supplier is recommended.':`Highest scoring supplier: ${run.snapshot.result.rows[0].name}. Final approval is still required.`}</p>}
 <p>Calculated {new Date(run.created_at).toLocaleString()}. Scores range from 0 to 1; higher is better.</p>
 </div>
 <div className="table-scroll" role="region" aria-label="Supplier rankings table" tabIndex={0}><table><thead><tr><th>Rank</th><th>Supplier</th><th>TOPSIS score</th></tr></thead><tbody>{run.snapshot.result.rows.map(r=><tr key={r.id}><td>{r.rank}</td><td>{r.name}</td><td>{Number(r.score).toFixed(6)}</td></tr>)}</tbody></table></div>
 <details className="rankings-details"><summary>View Calculation Details</summary><p>Vector normalization, approved weights, cost/benefit ideal values and Euclidean distances. Ranks use unrounded scores; exact calculated ties share a rank.</p><pre style={{overflow:'auto',maxHeight:450}}>{JSON.stringify(run.snapshot,null,2)}</pre></details></>}
 {run&&<>
 <section className="ai-recommendation" aria-labelledby="ai-recommendation-heading">
  <h3 id="ai-recommendation-heading">AI Recommendation</h3>
  <p className="ai-recommendation-notice">AI recommendations support decision-making. Final supplier selection remains with the authorized decision-maker.</p>
  {recommendationError&&<p role="alert" className="error">{recommendationError}</p>}
  {!recommendation&&<button className="primary" disabled={run.stale||generating} onClick={generateRecommendation}>{generating?'Generating Recommendation...':recommendationError?'Try Again':'Generate AI Recommendation'}</button>}
  {recommendation&&<div className="ai-recommendation-content">
   <section><h4>Recommended Supplier</h4>
    {recommendation.recommendation_type==='tie'?<><p><strong>Tied result:</strong> No single supplier is recommended.</p>{run.snapshot.result.rows.filter(row=>row.rank===1).map(row=><p key={row.id}><strong>{row.name}</strong> — Ranking position: {row.rank}; TOPSIS score: {Number(row.score).toFixed(6)}</p>)}</>:<>
     <p><strong>{run.snapshot.result.rows[0].name}</strong></p>
     <p>Ranking position: {run.snapshot.result.rows[0].rank}</p>
     <p>TOPSIS score: {Number(run.snapshot.result.rows[0].score).toFixed(6)}</p>
    </>}
   </section>
   <section><h4>Key Reasons for Recommendation</h4><ul>{recommendation.key_reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></section>
   <section><h4>Supplier Comparison and Trade-offs</h4>
    <p>{recommendation.supplier_comparison}</p>
   </section>
   <section><h4>Recommended Decision</h4><p>{recommendation.decision}</p></section>
  </div>}
 </section>
 </>}
 <div className="rankings-navigation"><button className="secondary" onClick={()=>location.hash=`/projects/${projectId}/matrix`}>← Back to Matrix</button></div>
 {run&&<>{canPrepare&&<section className="rankings-analysis"><h3>Optional analysis</h3><button className="primary" disabled={run.stale} onClick={()=>location.hash=`/projects/${projectId}/sensitivity`}>Run Sensitivity Analysis</button></section>}<section className="rankings-continuation"><button className="primary" disabled={run.stale} onClick={()=>location.hash=`/projects/${projectId}/decision`}>Continue to Final Decision →</button></section></>}</section>;
}
