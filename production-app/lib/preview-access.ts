type PreviewEnv = { [key: string]: string | undefined; RENDER?: string; AESTHENDA_HOSTED_PREVIEW?: string; AESTHENDA_PREVIEW_ACCESS_KEY?: string};

// This outer gate restricts the hosted test site. Salon/client authentication
// still runs after it succeeds; this key never grants access to salon records.
export async function previewAccess(authorization: string | null, env: PreviewEnv): Promise<'allow' | 'unconfigured' | 'deny'> {
  if (env.RENDER !== 'true' && env.AESTHENDA_HOSTED_PREVIEW !== '1') return 'allow';
  const key = env.AESTHENDA_PREVIEW_ACCESS_KEY;
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return 'unconfigured';
  let supplied = '';
  try {
    if (!authorization || authorization.length > 512 || !/^Basic /i.test(authorization)) return 'deny';
    supplied = atob(authorization.slice(6));
  } catch { return 'deny'; }
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [actual, expected] = await Promise.all([digest(supplied), digest(`preview:${key}`)]);
  const a = new Uint8Array(actual), b = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0 ? 'allow' : 'deny';
}
