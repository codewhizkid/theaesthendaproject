import 'server-only';
import {databaseConnectionConfig} from '@/lib/database-connection';
import { Pool } from 'pg';
import type { BusinessSetup, SetupInput } from './input';

let pool: Pool | undefined;
function runtimePool() {
  const connectionString = process.env.AESTHENDA_DATABASE_URL;
  if (!connectionString) throw new Error('Business setup is not connected yet. Please try again after database configuration is complete.');
  // The connection must be provisioned as the least-privileged runtime login.
  // Preserve TLS verification; do not use rejectUnauthorized:false.
  pool ??= new Pool({ ...databaseConnectionConfig(connectionString,process.env.AESTHENDA_DATABASE_CA), max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 10000, application_name: 'aesthenda-web' });
  return pool;
}
export async function checkedRuntime() {
  const client = await runtimePool().connect();
  try {
    const {rows} = await client.query("select current_user as name, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, has_table_privilege(current_user,'public.businesses','INSERT') as direct_write from pg_roles where rolname=current_user");
    const role=rows[0];
    if (role?.name !== 'aesthenda_runtime' || role.rolsuper || role.rolbypassrls || role.rolcreaterole || role.rolcreatedb || role.direct_write) {
      throw new Error('The private database connection must use the restricted Aesthenda runtime role.');
    }
    return client;
  } catch (error) { client.release(); throw error; }
}
export async function readBusinessSetup(actorId: string): Promise<BusinessSetup | null> {
  const client = await checkedRuntime();
  try {
    const result = await client.query('select aesthenda_private.read_business_setup($1::uuid) as result', [actorId]);
    return result.rows[0].result;
  } finally { client.release(); }
}
export async function persistBusinessSetup(actor: {id: string; email: string}, input: SetupInput): Promise<BusinessSetup> {
  const client = await checkedRuntime();
  try {
    const result = await client.query('select aesthenda_private.create_business_account_v1($1::uuid,$2::text,$3::uuid,$4::text,$5::text) as result', [actor.id, actor.email, input.requestKey, input.businessName, input.professionalName]);
    return result.rows[0].result;
  } finally { client.release(); }
}
