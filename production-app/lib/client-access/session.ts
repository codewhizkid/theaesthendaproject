export const clientRememberCookie='ae-client-remember';
export const clientPasswordFlowCookie='ae-client-password-flow';
export const rememberedClientDays=30;
// This is a persistence preference, never evidence of identity or device approval.
export function clientSessionCookieOptions<T extends {maxAge?:number;expires?:Date}>(options:T,remembered:boolean):T{
 const result={...options};
 if(options.maxAge===0)return result;
 if(remembered){result.maxAge=rememberedClientDays*86400;delete result.expires;}
 else{delete result.maxAge;delete result.expires;}
 return result;
}
export function clientPasswordError(password:unknown,confirmation:unknown){return typeof password!=='string'||password.length<12||password.length>128||password!==confirmation?'Use 12–128 characters and make sure both passwords match.':null;}
