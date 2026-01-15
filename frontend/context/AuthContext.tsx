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
function useProtectedRoute(userToken: string | null, isNavigationReady: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isNavigationReady) return;

    // 1. Get the current root segment (e.g., "login", "signup", "(tabs)")
    const currentRoute = segments[0];

    // 2. Define which routes are PUBLIC (accessible without logging in)
    const isPublicRoute = currentRoute === 'login' || currentRoute === 'signup';

    // 3. LOGIC:
    if (!userToken && !isPublicRoute) {
      // Scenario: Not logged in, trying to access home/tabs
      // Action: Kick them to Login
      router.replace('/login');
    
    } else if (userToken && isPublicRoute) {
      // Scenario: Logged in, but currently stuck on Login or Signup screen
      // Action: Send them to Home
      router.replace('/(tabs)');
    }

  }, [userToken, segments, isNavigationReady]);
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
        setIsLoading(false);
      }
    };

    loadToken();
  }, []);

  // Run the protection hook
  useProtectedRoute(userToken, isNavigationReady);

  const signIn = async (token: string) => {
    await saveSecure('accessToken', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUserToken(token);
  };

  const signOut = async () => {
    await removeSecure('accessToken');
    await removeSecure('refreshToken'); 
    delete api.defaults.headers.common['Authorization'];
    setUserToken(null);
  };

  // Helper to wait for navigation to be ready
  useEffect(() => {
    setIsNavigationReady(true);
  }, []);

  return (
    <AuthContext.Provider value={{ userToken, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}