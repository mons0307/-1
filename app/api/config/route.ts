import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export function GET() {
  const bindings=env as unknown as Record<string,string|undefined>;
  const url=bindings.SUPABASE_URL;
  const key=bindings.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return Response.json({error:'아직 학교 일기장 연결을 준비하고 있어요. 선생님께 알려 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});
  if(!key.startsWith('sb_publishable_')) return Response.json({error:'Supabase 공개 키 설정을 확인해 주세요.'},{status:503});
  return Response.json({url,key},{headers:{'Cache-Control':'no-store'}});
}
