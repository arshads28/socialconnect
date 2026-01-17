//socialconnect/frontend/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { getSecure, saveSecure, removeSecure } from '../utils/storage'; 
import api from '../utils/api';

// 1. Define the User Shape (Adjust based on your backend response)
type UserType = {
  id: number;
  username: string;
  email: string;
  avatar?: string;
};

type AuthType = {
  user: UserType | null; // <--- ADDED THIS
  userToken: string | null;
  isLoading: boolean;
  signIn: (token: string, userData: UserType) => Promise<void>; // <--- Updated to accept user data
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthType>({
  user: null,
  userToken: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ------------------------------------------------------
// 🔒 ROUTE PROTECTION (unchanged)
// ------------------------------------------------------
function useProtectedRoute(userToken: string | null, isNavigationReady: boolean, isLoading: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isNavigationReady || isLoading) return;

    const currentRoute = segments[0];
    const isPublicRoute = currentRoute === 'login' || currentRoute === 'signup';

    if (!userToken && !isPublicRoute) {
      router.replace('/login');
    } else if (userToken && isPublicRoute) {
      router.replace('/(tabs)');
    }

  }, [userToken, segments, isNavigationReady, isLoading]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserType | null>(null); // <--- State for User
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const token = await getSecure('accessToken');
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setUserToken(token);
          
          // 2. FETCH USER DETAILS ON LOAD
          // We need to know "Who am I?" to enable chat features
          try {
            const response = await api.get('/auth/api/me/');
            setUser(response.data);
          } catch (err) {
            console.log("Token invalid or expired", err);
            // Optional: signOut() if token is invalid
          }
        }
      } catch (e) {
        console.log("Failed to load session", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  useProtectedRoute(userToken, isNavigationReady, isLoading);

  const signIn = async (token: string, userData: UserType) => {
    await saveSecure('accessToken', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUserToken(token);
    setUser(userData); // <--- Set User
  };

  const signOut = async () => {
    await removeSecure('accessToken');
    await removeSecure('refreshToken'); 
    delete api.defaults.headers.common['Authorization'];
    setUserToken(null);
    setUser(null); // <--- Clear User
    
    // Close WebSocket if open
    if (typeof window !== 'undefined' && (window as any).globalWs) {
      (window as any).globalWs.close();
    }
  };

  useEffect(() => {
    setIsNavigationReady(true);
  }, []);

  return (
    <AuthContext.Provider value={{ user, userToken, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}