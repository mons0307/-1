"use client";
import {useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {Sprout,LogOut} from 'lucide-react';
import {getSupabase} from './supabase';
import Journal from './journal';
import Teacher from './teacher';
export type Profile={id:string;display_name:string;role:'student'|'teacher'};
export default function SchoolApp(){
 const [session,setSession]=useState<Session|null>(null),[profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[demo,setDemo]=useState(false);
 useEffect(()=>{let active=true;let stop:undefined|(()=>void);let generation=0;let currentUid:string|undefined='__initial__';
  getSupabase().then(client=>{
   const update=async(next:Session|null)=>{if(!active||currentUid===next?.user.id)return;currentUid=next?.user.id;const ticket=++generation;setSession(next);setProfile(null);setError('');setLoading(!!next);if(!next){setLoading(false);return}
    const {data,error}=await client.from('profiles').select('id,display_name,role').eq('id',next.user.id).single();
    if(active&&ticket===generation){setProfile(data as Profile|null);setError(error?'계정의 학급 정보를 확인하지 못했어요. 선생님께 알려 주세요.':'');setLoading(false)}
   };
   const {data}=client.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>void update(next),0)});stop=()=>data.subscription.unsubscribe();
  }).catch(e=>{if(active){setError(e.message);setLoading(false)}});
  return()=>{active=false;stop?.()};
 },[]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const client=await getSupabase();const {error}=await client.auth.signInWithPassword({email:email.trim(),password});if(error)throw new Error('아이디와 비밀번호를 다시 확인해 주세요.');setPassword('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function logout(){if(!window.confirm('저장하지 않은 글이 있다면 먼저 저장해 주세요. 로그아웃할까요?'))return;const client=await getSupabase();const {error}=await client.auth.signOut({scope:'local'});if(error)setError('로그아웃하지 못했어요. 다시 시도해 주세요.')}
 if(demo)return <><div className="account-bar"><span>둘러보기 · 실제 기록은 저장되지 않아요</span><button className="text-button" onClick={()=>setDemo(false)}>로그인 화면으로</button></div><Journal demo/></>;
 if(loading)return <main className="auth-shell"><p role="status">일기장을 열고 있어요…</p></main>;
 if(!session)return <main className="auth-shell"><section className="paper auth-card"><span className="brand-icon"><Sprout/></span><p className="eyebrow">하루 한 줄, 고마운 마음</p><h1>마음 한 줄</h1><p>선생님이 알려 준 계정으로<br/>나만의 감사일기를 시작해요.</p><form onSubmit={login}><label>아이디 (이메일 형식)<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="선생님이 알려 준 아이디"/></label><label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'일기장을 여는 중…':'내 일기장 열기'}</button></form>{error&&<p className="notice error" role="alert">{error}</p>}<button className="text-button" onClick={()=>setDemo(true)}>로그인 없이 과정 둘러보기</button><p className="small">계정을 잊어버렸다면 선생님께 물어보세요.<br/>함께 쓰는 기기에서는 사용 후 로그아웃해요.</p></section></main>;
 return <><div className="account-bar"><span>{profile?.display_name??'내 계정'}{profile?.role==='teacher'?' · 선생님':''}</span><button className="text-button" onClick={()=>void logout()}><LogOut size={16}/>로그아웃</button></div>{error&&<p className="notice error" role="alert">{error}</p>}{profile?.role==='teacher'?<Teacher key={profile.id} profile={profile}/>:profile?<Journal key={profile.id}/>:null}</>;
}
