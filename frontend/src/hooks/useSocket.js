/* hooks/useSocket.js
 * Manages a single Socket.IO connection for the lifetime of the app.
 * Reads the in-memory access token via AuthContext and (re)connects when it
 * changes. Returns the socket instance so components can emit / listen.
 */
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_ORIGIN = new URL(API_URL, window.location.origin).origin;
const SOCKET_PATH = `${import.meta.env.BASE_URL}socket.io`; // '/cas/socket.io' in prod

export function useSocket(token) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Already connected with the same token — skip
    if (socketRef.current?.connected) return;

    const socket = io(SOCKET_ORIGIN, {
  path: SOCKET_PATH,
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      console.warn('[socket] connect error:', err.message);
      setConnected(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  return { socket: socketRef.current, connected };
}
