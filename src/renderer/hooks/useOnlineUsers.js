import { useAuth } from './useAuth'

// Returns the set of auth user ids (LCMS-allowed-users.registered_user_id)
// currently online. Reads from the single shared presence channel that
// useAuth owns — see the note in useAuth.jsx on why this must not open its
// own separate channel with the same topic name.
export function useOnlineUsers() {
  return useAuth().onlineIds
}
