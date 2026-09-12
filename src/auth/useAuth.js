import { useEffect, useState } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { resolveRole } from '../lib/permissions';
import { resolveLoginEmail } from '../lib/credentials';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (!u) { setProfile(null); setLoading(false); }
  }), []);

  useEffect(() => {
    if (!user) return undefined;
    setLoading(true);
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [user]);

  // Accepts either a Username or a real email — see resolveLoginEmail for
  // why Firebase Auth (which always signs in with an "email" string) can
  // still be driven by a Username with no server-side lookup involved.
  async function login(identifier, password) {
    await signInWithEmailAndPassword(auth, resolveLoginEmail(identifier), password);
  }
  async function logout() {
    await signOut(auth);
  }
  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }

  return { user, profile, role: resolveRole(profile), loading, login, logout, resetPassword };
}
