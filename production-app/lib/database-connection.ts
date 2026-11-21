export function databaseConnectionConfig(connectionString:string,certificate?:string){
 if(!certificate)return {connectionString};
 const ca=certificate.replace(/\\n/g,'\n').trim();
 if(!ca.startsWith('-----BEGIN CERTIFICATE-----')||!ca.endsWith('-----END CERTIFICATE-----'))throw Error('Configure the database CA certificate.');
 const url=new URL(connectionString);
 // pg connection-string SSL settings replace the ssl object; remove them when
 // supplying the trusted CA explicitly. Verification remains mandatory.
 for(const name of ['sslmode','sslrootcert','sslcert','sslkey','sslpassword','uselibpqcompat'])url.searchParams.delete(name);
 return {connectionString:url.toString(),ssl:{ca,rejectUnauthorized:true}};
}
