import {useEffect,useState} from 'react';
import {api} from './api';
export type Run={id:string;created_at:string;stale:boolean;snapshot:{method:string;criteria:{id:string;name:string}[];weights:Record<string,string>;result:{rows:{id:string;name:string;score:string;rank:number}[]}}};
export function Rankings({projectId}:{projectId:string}){
 const [run,setRun]=useState<Run|null>(null),[error,setError]=useState('');
 useEffect(()=>{api<Run>(`/api/projects/${projectId}/rankings`).then(setRun).catch(e=>setError(e.message));},[projectId]);
 return <section className="supplier-page"><h2>Supplier Rankings</h2>{error&&<p role="alert" className="error">{error}</p>}{run&&<>
 {run.stale?<p role="alert" className="error">These rankings are out of date. Review the matrix and calculate again before using them.</p>:<p className="success">{run.snapshot.result.rows.filter(r=>r.rank===1).length>1?'The highest score is tied. No single supplier is recommended.':`Highest scoring supplier: ${run.snapshot.result.rows[0].name}. Final approval is still required.`}</p>}
 <p>Calculated {new Date(run.created_at).toLocaleString()}. Scores range from 0 to 1; higher is better.</p>
 <table><thead><tr><th>Rank</th><th>Supplier</th><th>TOPSIS score</th></tr></thead><tbody>{run.snapshot.result.rows.map(r=><tr key={r.id}><td>{r.rank}</td><td>{r.name}</td><td>{Number(r.score).toFixed(6)}</td></tr>)}</tbody></table>
 <details><summary>View Calculation Details</summary><p>Vector normalization, approved weights, cost/benefit ideal values and Euclidean distances. Ranks use unrounded scores; exact calculated ties share a rank.</p><pre style={{overflow:'auto',maxHeight:450}}>{JSON.stringify(run.snapshot,null,2)}</pre></details>
 <button className="primary" disabled={run.stale} onClick={()=>location.hash=`/projects/${projectId}/sensitivity`}>Run Sensitivity Analysis</button><p className="info">Final purchasing decisions will be added in a later step.</p></>}
 <button className="secondary" onClick={()=>location.hash=`/projects/${projectId}/matrix`}>← Back to Matrix</button></section>;
}
