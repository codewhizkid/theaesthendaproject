type AuthVerifier = {
  getUser: () => Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
};

// A signup user can exist before email confirmation creates a session.
export async function hasVerifiedSession(
  auth: AuthVerifier,
  session: { user: { id: string } } | null,
): Promise<boolean> {
  if (!session) return false;
  const { data, error } = await auth.getUser();
  return !error && !!data.user && data.user.id === session.user.id;
}
