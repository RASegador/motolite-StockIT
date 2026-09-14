// src/auth/useAuth.test.js
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

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

  // Seed one Auth account via the Auth emulator's REST API — its matching
  // Firestore profile doc is written below via the Admin SDK.
  const signUpRes = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test', {
    method: 'POST',
    // The Auth emulator's REST endpoint needs an explicit Content-Type to
    // parse the JSON body at all — without it the request body is
    // effectively ignored, the emulator rejects the sign-up, and the
    // response has no `localId`, which then crashes setDoc() below with an
    // unrelated-looking "Cannot read properties of undefined (reading
    // 'indexOf')" from inside Firestore's path parsing.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mgr@test.com', password: 'password123', returnSecureToken: true }),
  });
  const signUpBody = await signUpRes.json();
  if (!signUpBody.localId) {
    throw new Error(`Auth emulator sign-up failed: ${JSON.stringify(signUpBody)}`);
  }
  // Seeding the Firestore profile doc for this brand-new account can't go
  // through `testDb` (the plain client SDK) — firestore.rules' `users`
  // create rule requires isAdmin(), and the REST sign-up above never
  // authenticates `testAuth`'s own client session anyway (that only happens
  // via the SDK's own signIn*() methods), so a client-side setDoc() here is
  // always denied no matter who's "signed in". The Admin SDK bypasses
  // Security Rules entirely — same as every seed step in the
  // *Actions.test.js files' `withSecurityRulesDisabled()`, just via
  // firebase-admin instead of rules-unit-testing (this file was written
  // before that helper existed here, using a real Auth emulator instead).
  if (!getAdminApps().length) {
    initializeAdminApp({ projectId: 'motolite-ims-test' });
  }
  await getAdminFirestore().collection('users').doc(signUpBody.localId).set({
    uid: signUpBody.localId, email: 'mgr@test.com', role: 'manager', shopId: 'shopA', fullName: 'Test Manager',
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
