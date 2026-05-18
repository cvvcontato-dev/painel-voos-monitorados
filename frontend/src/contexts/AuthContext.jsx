import { createContext, useState, useEffect, useCallback } from 'react';
import { me } from '../api/authClient';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(undefined); // undefined = loading
  const [sessionExpired, setSessionExpired] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const user = await me();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    function handleExpired() { setSessionExpired(true); }
    window.addEventListener('auth:session-expired', handleExpired);
    return () => window.removeEventListener('auth:session-expired', handleExpired);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, sessionExpired, setSessionExpired, reload: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}
