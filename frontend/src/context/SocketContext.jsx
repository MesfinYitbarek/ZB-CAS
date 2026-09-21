/* context/SocketContext.jsx
 * Single shared Socket.IO connection for the whole app.
 *
 * Why this exists:
 *  - Header and SupportWidget each ran their own useSocket() before, opening
 *    TWO connections per user (double presence broadcasts, double emits).
 *  - The access token lives in a ref and rotates silently (no re-render), so a
 *    token snapshot taken at login goes stale. After the 15-minute access
 *    token expires, any reconnect handshakes with the dead token and the chat
 *    silently dies until reload. This provider re-reads the token
 *    periodically and only swaps state (triggering one reconnect) when it
 *    actually changed.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from './AuthContext';

const SocketContext = createContext({ socket: null, connected: false });

export const useAppSocket = () => useContext(SocketContext);

export default function SocketProvider({ children }) {
  const { getAccessToken, user } = useAuth();
  const [token, setToken] = useState(() =>
    typeof getAccessToken === 'function' ? getAccessToken() : null
  );

  useEffect(() => {
    if (typeof getAccessToken !== 'function') return;
    setToken(getAccessToken());
    const t = setInterval(() => {
      const fresh = getAccessToken();
      setToken((prev) => (prev === fresh ? prev : fresh));
    }, 60_000);
    return () => clearInterval(t);
  }, [getAccessToken, user]);

  const { socket, connected } = useSocket(token);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}
