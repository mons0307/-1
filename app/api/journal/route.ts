import {getChatGPTUser} from '../../chatgpt-auth';
import {database} from '../../../db/database';
import {stageFor,stages,lessonFor, type Entry} from '../../content';
export const dynamic='force-dynamic';
type Data={intro:boolean;entries:Entry[]};
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function result(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
async function read(userId:string){const row=await database().prepare('SELECT data,version FROM journal_state WHERE user_id=?').bind(userId).first<{data:string;version:number}>();return row?{data:JSON.parse(row.data) as Data,version:row.version}:{data:{intro:false,entries:[]} as Data,version:0}}
export async function GET(){try{const user=await getChatGPTUser();if(!user)return result({error:'기록을 불러오려면 로그인해 주세요.'},401);return result({...await read(user.userId),today:today()})}catch(error){console.error('Journal load failed',error instanceof Error?error.message:'unknown');return result({error:'기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'},503)}}
export async function POST(request:Request){try{const user=await getChatGPTUser();if(!user)return result({error:'로그인 후 다시 시도해 주세요.'},401);const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return result({error:'요청 주소를 확인해 주세요.'},403);const raw=await request.text();if(raw.length>20000)return result({error:'입력한 글이 너무 길어요.'},400);let b;try{b=JSON.parse(raw)}catch{return result({error:'입력 내용을 확인해 주세요.'},400)}const current=await read(user.userId);if(!Number.isInteger(b.version)||b.version!==current.version)return result({error:'다른 창에서 기록이 바뀌었어요. 입력한 글을 복사해 두고 기록을 다시 불러와 주세요.'},409);const data=current.data;const date=today();if(b.action==='start'){data.intro=true}else if(b.action==='save'){
if(!data.intro)return result({error:'먼저 서두를 읽고 시작해 주세요.'},400);
const e=b.entry;if(!e||!Number.isInteger(e.day)||e.day<1||!Array.isArray(e.answers)||typeof e.activity!=='string'||typeof e.read!=='boolean'||typeof e.done!=='boolean')return result({error:'입력 내용을 확인해 주세요.'},400);
const expected=stages[stageFor(e.day)-1].questions.length;if(e.answers.length!==expected||e.answers.some((x:unknown)=>typeof x!=='string'||x.length>2000)||e.activity.length>4000)return result({error:'일기는 칸마다 2,000자, 활동은 4,000자까지 쓸 수 있어요.'},400);
if(e.done&&!e.answers.some((x:string)=>x.trim()))return result({error:'오늘의 마음을 한 줄 이상 적어 주세요.'},400);
const existing=data.entries.find(x=>x.day===e.day);const completed=data.entries.filter(x=>x.done);const next=completed.length+1;
if(!existing&&(e.day!==next||completed.some(x=>x.date===date)))return result({error:'오늘의 일기를 이어 써 주세요. 다음 기록은 내일 시작해요.'},409);
if(existing?.done&&!e.done)e.done=true;
if(e.done&&!e.answers.some((x:string)=>x.trim()))return result({error:'오늘의 마음을 한 줄 이상 적어 주세요.'},400);
if((e.revision??0)!==(existing?.revision??0))return result({error:'이 일기가 다른 창에서 바뀌었어요. 작성한 글을 복사한 뒤 새로고침해 주세요.'},409);
if(!lessonFor(e.day)){e.activity='';e.read=false;}
const saved:Entry={day:e.day,date:existing?.done?existing.date:date,answers:e.answers.map((x:string)=>x.trim()),activity:e.activity.trim(),read:e.read,done:e.done,revision:(existing?.revision??0)+1};
data.entries=existing?data.entries.map(x=>x.day===saved.day?saved:x):[...data.entries,saved];
}else return result({error:'지원하지 않는 요청이에요.'},400);
const db=database();const updated=current.version===0?await db.prepare('INSERT OR IGNORE INTO journal_state (user_id,data,version) VALUES (?,?,1)').bind(user.userId,JSON.stringify(data)).run():await db.prepare('UPDATE journal_state SET data=?,version=version+1 WHERE user_id=? AND version=?').bind(JSON.stringify(data),user.userId,current.version).run();
if(updated.meta.changes!==1)return result({error:'다른 창에서 기록이 바뀌었어요. 입력한 글을 복사해 두고 기록을 다시 불러와 주세요.'},409);
return result({data,version:current.version+1,today:date});
}catch(error){console.error('Journal save failed',error instanceof Error?error.message:'unknown');return result({error:'저장하지 못했어요. 작성한 글은 화면에 남아 있어요. 다시 저장해 주세요.'},503)}}
