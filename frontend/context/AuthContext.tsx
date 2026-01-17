import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { getSecure, saveSecure, removeSecure } from '../utils/storage'; 
import api, { setClientToken } from '../utils/api'; // ✅ Import setClientToken

// 1. Define the User Shape
type UserType = {
  id: number;
  username: string;
  email: string;
  avatar?: string;
  is_online?: boolean; // Optional based on your backend
};

// 2. Define the Context Shape
type AuthType = {
  user: UserType | null;
  userToken: string | null;
  isLoading: boolean;
  // ✅ signIn now accepts 3 arguments
  signIn: (accessToken: string, refreshToken: string, userData: UserType) => Promise<void>; 
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

// 🔒 Route Protection Hook
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
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  // 1. Load Session on App Start
  useEffect(() => {
    const loadSession = async () => {
      try {
        const token = await getSecure('accessToken');
        if (token) {
          // Initialize API Memory immediately
          setClientToken(token); 
          setUserToken(token);
          
          // Fetch User Data
          try {
            const response = await api.get('/auth/api/me/');
            setUser(response.data);
          } catch (err) {
            console.log("Token invalid or expired", err);
            // Optionally force logout here if 401
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

  // 2. Sign In Function
  const signIn = async (accessToken: string, refreshToken: string, userData: UserType) => {
    // A. Save to Disk (Async)
    await saveSecure('accessToken', accessToken);
    await saveSecure('refreshToken', refreshToken);
    
    // B. Set Memory (Instant)
    setClientToken(accessToken);

    // C. Update State
    setUserToken(accessToken);
    setUser(userData); 
  };

  // 3. Sign Out Function
  const signOut = async () => {
    // A. Clear Disk
    await removeSecure('accessToken');
    await removeSecure('refreshToken'); 
    
    // B. Clear Memory
    setClientToken(null);
    
    // C. Clear State
    setUserToken(null);
    setUser(null); 
    
    // D. Close WebSocket if it exists
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