import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigJSON from '../../firebase-applet-config.json';

const getFirebaseConfig = () => {
  if (firebaseConfigJSON && Object.keys(firebaseConfigJSON).length > 0) {
    return firebaseConfigJSON;
  }
  
  // Dynamic fallback for production environments (e.g. Railway)
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID
  };
};

const config = getFirebaseConfig();

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(config);
} else {
  app = getApps()[0];
}

export const db = getFirestore(app, config.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);
