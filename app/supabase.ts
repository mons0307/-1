"use client";
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
let pending: Promise<SupabaseClient> | undefined;
export function getSupabase() {
  pending ??= fetch('/api/config', {cache:'no-store'}).then(async response => {
    const config = await response.json() as {url:string;key:string;error?:string};
    if (!response.ok) throw new Error(config.error);
    return createClient(config.url, config.key, {
      auth: {persistSession:true, storage:window.sessionStorage, autoRefreshToken:true, detectSessionInUrl:false},
    });
  }).catch(error => {pending=undefined; throw error;});
  return pending;
}
export async function journalRequest(body?: object) {
  const client=await getSupabase();
  const {data,error}=await client.rpc('journal_request',{payload:body??null});
  if(error) throw new Error(/[가-힣]/.test(error.message) ? error.message : '기록을 불러오거나 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');
  return data;
}
