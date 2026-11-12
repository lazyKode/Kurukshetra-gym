
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
// import { getAuth } from "firebase/auth"; // If you need auth
import { getStorage, type FirebaseStorage } from "firebase/storage"; // If you need storage

// Your web app's Firebase configuration
// IMPORTANT: Use environment variables for sensitive information
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Initialize Firebase
let app: FirebaseApp;
let db: Firestore;
// let auth; // If using auth
let storage: FirebaseStorage; // If using storage

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

db = getFirestore(app);
// auth = getAuth(app); // If using auth
storage = getStorage(app); // If using storage

export { app, db, storage /*, auth */ };

// Instructions for user:
// 1. Create a Firebase project at https://console.firebase.google.com/
// 2. Add a Web App to your project.
// 3. Copy the firebaseConfig object details from your Firebase project settings.
// 4. Create a .env.local file in the root of your Next.js project.
// 5. Add your Firebase config values to .env.local, prefixed with NEXT_PUBLIC_:
//    NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
//    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
//    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
//    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
//    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
//    NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
//    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id (optional)
// 6. Enable Firestore in your Firebase project.
// 7. Set up Firestore security rules. For development, you might use:
//    rules_version = '2';
//    service cloud.firestore {
