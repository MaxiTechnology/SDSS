import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {api} from './api';

type Store={values:Map<string,unknown>;pending:Map<string,Promise<unknown>>;generation:number};
const Context=createContext<Store|null>(null);
export function PageReads({children}:{children:ReactNode}){
 const store=useRef<Store>({values:new Map(),pending:new Map(),generation:0});
 useEffect(()=>{const clear=()=>{store.current.generation++;store.current.values.clear();store.current.pending.clear();};window.addEventListener('sdss-data-changed',clear);return()=>window.removeEventListener('sdss-data-changed',clear);},[]);
 return <Context.Provider value={store.current}>{children}</Context.Provider>;
}
function read<T>(store:Store,path:string):Promise<T>{
 const existing=store.pending.get(path);if(existing)return existing as Promise<T>;
 const generation=store.generation;
 const task=api<T>(path).then(value=>{if(store.generation===generation)store.values.set(path,value);return value;},error=>{if(store.generation===generation)store.values.delete(path);throw error;});
 store.pending.set(path,task);
 const clear=()=>{if(store.pending.get(path)===task)store.pending.delete(path);};void task.then(clear,clear);return task;
}
export function usePagePreload(){const store=useContext(Context)!;return (path:string)=>{if(!store.values.has(path))void read(store,path).catch(()=>{});};}
export function usePageRead<T>(path:string,enabled=true){
 const store=useContext(Context)!;
 const [data,setData]=useState<T|null>(()=>(store.values.get(path) as T)??null),[loading,setLoading]=useState(true),[error,setError]=useState('');const version=useRef(0);
 async function reload(){if(!enabled){setLoading(false);return;}const request=++version.current;setLoading(true);setError('');try{const next=await read<T>(store,path);if(request===version.current)setData(next);}catch(e){if(request===version.current){setData(null);setError((e as Error).message);}}finally{if(request===version.current)setLoading(false);}}
 useEffect(()=>{setData(enabled?(store.values.get(path) as T)??null:null);void reload();return()=>{version.current++;};},[path,enabled]);
 return {data,loading,error,reload};
}
