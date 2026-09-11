// src/auth/useAuth.test.js
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, setDoc } from 'firebase/firestore';

// This test talks to the local Firebase emulators (Auth + Firestore) —
// run it via: firebase emulators:exec "vitest run src/auth/useAuth.test.js"
let app, testAuth, testDb, useAuth;

beforeAll(async () => {
  app = initializeApp({ apiKey: 'test', projectId: 'motolite-ims-test' }, 'auth-test-app');
  testAuth = getAuth(app);
  testDb = getFirestore(app);
  connectAuthEmulator(testAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(testDb, '127.0.0.1', 8080);

  // Point src/firebase.js's exported auth/db at this same emulator-backed
  // app by mocking the module — useAuth imports from '../firebase'.
  vi.doMock('../firebase', () => ({ auth: testAuth, db: testDb }));
  ({ useAuth } = await import('./useAuth'));

  // Seed one user via the Auth emulator's REST API (fastest path — avoids
  // needing firebase-admin in the test process).
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', {
    method: 'POST',
    body: JSON.stringify({ email: 'mgr@test.com', password: 'password123', returnSecureToken: true }),
  }).then(async (res) => {
    const { localId } = await res.json();
    await setDoc(doc(testDb, 'users', localId), {
      uid: localId, email: 'mgr@test.com', role: 'manager', shopId: 'shopA', fullName: 'Test Manager',
    });
  });
  await testAuth.signOut();
});

afterAll(async () => {
  await deleteApp(app);
});

describe('useAuth', () => {
  it('starts logged out with loading false once the initial auth check resolves', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBe(null);
  });

  it('loads the matching Firestore profile and resolved role after login', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('mgr@test.com', 'password123');
    });

    await waitFor(() => expect(result.current.profile).not.toBe(null));
    expect(result.current.profile.shopId).toBe('shopA');
    expect(result.current.role).toBe('manager');
  });

  it('rejects a wrong password', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.login('mgr@test.com', 'wrong-password')).rejects.toThrow();
  });
});
