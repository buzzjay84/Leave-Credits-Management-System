// Shared Supabase Realtime Presence channel name. Any authenticated session
// tracks itself here (see useAuth); anything that wants to know who is
// currently online (e.g. AllowedUsersAdmin) subscribes read-only to the
// same channel and reads channel.presenceState().
export const PRESENCE_CHANNEL = 'lcms-presence'
