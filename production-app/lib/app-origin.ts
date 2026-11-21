export type AppOriginEnv={AESTHENDA_STAGING?:string;AESTHENDA_PUBLIC_ORIGIN?:string;AESTHENDA_HOSTED_PREVIEW?:string;VERCEL?:string;NODE_ENV?:string};
export function appOrigin(env:AppOriginEnv){
 const configured=env.AESTHENDA_PUBLIC_ORIGIN?.trim();
 const hosted=env.AESTHENDA_HOSTED_PREVIEW==='1'||env.VERCEL==='1';
 const raw=configured||(!hosted&&env.AESTHENDA_STAGING==='1'?'http://127.0.0.1:3190':'');
 if(!raw)throw Error('Configure the application origin.');
 const url=new URL(raw);
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(url.protocol==='http:'&&local&&!hosted&&env.AESTHENDA_STAGING==='1'))||(hosted&&local))throw Error('Configure a secure application origin.');
 return url.origin;
}
export function appCookieSecure(env:AppOriginEnv){
 try{return new URL(appOrigin(env)).protocol==='https:';}catch{return env.NODE_ENV==='production'||env.AESTHENDA_HOSTED_PREVIEW==='1'||env.VERCEL==='1';}
}
export function appSignInRedirect(path:'/auth/sign-in'|'/client/sign-in',requestUrl:string,env:AppOriginEnv){
 const origin=env.AESTHENDA_HOSTED_PREVIEW==='1'||env.VERCEL==='1'?appOrigin(env):requestUrl;
 return new URL(path,origin).toString();
}
