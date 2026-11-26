import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {api,recommendationStoragePrefix} from './api';
import {useAuth} from './auth';

class RecommendationCache extends Map<string,unknown>{
 constructor(private key:string){
  super();
  try{
   for(let index=sessionStorage.length-1;index>=0;index--){const key=sessionStorage.key(index);if(key?.startsWith(recommendationStoragePrefix)&&key!==this.key)sessionStorage.removeItem(key);}
   const saved=sessionStorage.getItem(this.key);
   if(saved){const entries:unknown=JSON.parse(saved);if(!Array.isArray(entries)||!entries.every(entry=>Array.isArray(entry)&&entry.length===2&&typeof entry[0]==='string'))throw Error('Invalid recommendation cache');for(const [key,value] of entries)super.set(key,value);}
  }catch(error){console.warn('Recommendation storage is unavailable or invalid; recommendations will remain in memory only.',error);}
 }
 private save(){try{sessionStorage.setItem(this.key,JSON.stringify(Array.from(this.entries())));}catch(error){console.warn('Could not retain recommendations across refresh.',error);}}
 set(key:string,value:unknown){super.set(key,value);this.save();return this;}
 delete(key:string){const deleted=super.delete(key);this.save();return deleted;}
 clear(){super.clear();try{sessionStorage.removeItem(this.key);}catch(error){console.warn('Could not clear recommendation storage.',error);}}
}
type Store={values:Map<string,unknown>;pending:Map<string,Promise<unknown>>;recommendations:RecommendationCache;generation:number};
const Context=createContext<Store|null>(null);
export function PageReads({children}:{children:ReactNode}){
 const {user}=useAuth();
 const store=useRef<Store|null>(null);
 if(!store.current)store.current={values:new Map(),pending:new Map(),recommendations:new RecommendationCache(recommendationStoragePrefix+user.id),generation:0};
 useEffect(()=>{const current=store.current!;const clear=()=>{current.generation++;current.values.clear();current.pending.clear();};window.addEventListener('sdss-data-changed',clear);return()=>window.removeEventListener('sdss-data-changed',clear);},[]);
 useEffect(()=>{const clear=()=>store.current?.recommendations.clear();window.addEventListener('sdss-signed-out',clear);window.addEventListener('sdss-auth-required',clear);return()=>{window.removeEventListener('sdss-signed-out',clear);window.removeEventListener('sdss-auth-required',clear);};},[]);
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
export function useRecommendationCache<T>(){
 const store=useContext(Context)!;
 return store.recommendations as Map<string,T>;
}
export function usePageRead<T>(path:string,enabled=true){
 const store=useContext(Context)!;
 const [data,setData]=useState<T|null>(()=>(store.values.get(path) as T)??null),[loading,setLoading]=useState(true),[error,setError]=useState('');const version=useRef(0);
 async function reload(){if(!enabled){setLoading(false);return;}const request=++version.current;setLoading(true);setError('');try{const next=await read<T>(store,path);if(request===version.current)setData(next);}catch(e){if(request===version.current){setData(null);setError((e as Error).message);}}finally{if(request===version.current)setLoading(false);}}
 useEffect(()=>{setData(enabled?(store.values.get(path) as T)??null:null);void reload();return()=>{version.current++;};},[path,enabled]);
 return {data,loading,error,reload};
}
