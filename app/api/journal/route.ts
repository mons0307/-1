// Sites trusted headers and D1 are no longer an authentication path.
export function GET(){return Response.json({error:'새 일기장에 다시 로그인해 주세요.'},{status:410})}
export const POST=GET;
