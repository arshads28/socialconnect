import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { getSecure, saveSecure, removeSecure } from '../utils/storage'; 
import api from '../utils/api';

type AuthType = {
  userToken: string | null;
  isLoading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthType>({
  userToken: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ------------------------------------------------------
// 🔒 FIXED ROUTE PROTECTION
// ------------------------------------------------------
function useProtectedRoute(userToken: string | null, isNavigationReady: boolean, isLoading: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    //  STOP: If navigation isn't ready OR we are still loading the token, do nothing.
    if (!isNavigationReady || isLoading) return;

    const currentRoute = segments[0];
    const isPublicRoute = currentRoute === 'login' || currentRoute === 'signup';

    // Logic:
    if (!userToken && !isPublicRoute) {
      // Not logged in -> Go to Login
      router.replace('/login');
    
    } else if (userToken && isPublicRoute) {
      // Logged in -> Go to Home
      router.replace('/(tabs)');
    }

  }, [userToken, segments, isNavigationReady, isLoading]); // <--- Added isLoading here
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  useEffect(() => {
    const loadToken = async () => {
      try {
        const token = await getSecure('accessToken');
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setUserToken(token);
        }
      } catch (e) {
        console.log("Failed to load token", e);
      } finally {
        // Only stop loading after we have checked storage
        setIsLoading(false);
      }
    };

    loadToken();
  }, []);

  // Pass isLoading to the protection hook
  useProtectedRoute(userToken, isNavigationReady, isLoading);

  const signIn = async (token: string) => {
    await saveSecure('accessToken', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUserToken(token);
    // Explicitly navigate after sign in
    // router.replace('/(tabs)'); // handled by useProtectedRoute
  };

  const signOut = async () => {
    await removeSecure('accessToken');
    await removeSecure('refreshToken'); 
    delete api.defaults.headers.common['Authorization'];
    setUserToken(null);
    if (typeof window !== 'undefined' && (window as any).globalWs) {
      (window as any).globalWs.close();
    }
  };

  useEffect(() => {
    setIsNavigationReady(true);
  }, []);

  return (
    <AuthContext.Provider value={{ userToken, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}