
// src/lib/firebase-admin.ts
console.log('Firebase Admin: Top of firebase-admin.ts executing...'); // NEW LOG

import { initializeApp, getApps, cert, type App as AdminAppType } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue, type Firestore as AdminFirestoreType } from 'firebase-admin/firestore';

console.log('Firebase Admin: Imports loaded.');

let serviceAccount: any;
let adminApp: AdminAppType | null = null;
let adminDb: AdminFirestoreType | null = null;

try {
  console.log("Firebase Admin: Attempting to load service account key from ../service-account-key.json. Current working directory during require might affect relative paths if not run from project root.");
  serviceAccount = require('../service-account-key.json');
  if (serviceAccount && serviceAccount.project_id) {
    console.log(`Firebase Admin: Service account key loaded successfully. PROJECT ID FROM KEY: ${serviceAccount.project_id}`);
  } else {
    console.error("Firebase Admin: CRITICAL FAILURE - Service account key loaded but is invalid or missing project_id. Ensure the JSON is correct and contains a 'project_id' field. Path: ../service-account-key.json");
    serviceAccount = null;
  }
} catch (e: any) {
  console.error(`Firebase Admin: CRITICAL FAILURE - FAILED TO LOAD SERVICE ACCOUNT KEY. Path: ../service-account-key.json. Ensure the file exists at this location (relative to 'src/lib/'), is valid JSON, and is not empty. Error: ${e.message}`, e.stack);
  serviceAccount = null;
}

if (getApps().length) {
  adminApp = getApps()[0];
  if (adminApp) {
    console.log(`Firebase Admin: Re-using existing app instance for project: ${adminApp.options.projectId || 'N/A'}.`);
  } else {
    console.error("Firebase Admin: Existing getApps()[0] is unexpectedly null/undefined. This might indicate a deeper issue with Firebase Admin SDK's internal state.");
  }
} else if (serviceAccount && serviceAccount.project_id) { // Check serviceAccount.project_id here
  try {
    console.log(`Firebase Admin: Attempting to initialize new Firebase app for PROJECT ID: ${serviceAccount.project_id}.`);
    adminApp = initializeApp({
      credential: cert(serviceAccount),
    });
    console.log(`Firebase Admin: New app initialized successfully. CONNECTED PROJECT ID: ${adminApp.options.projectId || 'N/A'}.`);
  } catch (e: any) {
    console.error(`Firebase Admin: CRITICAL FAILURE - FAILED TO INITIALIZE NEW APP for project ${serviceAccount.project_id}. Usually caused by an invalid service account key (check content and permissions) or incorrect Firebase project configuration. Error: ${e.message}`, e.stack);
    adminApp = null;
  }
} else {
  if (!serviceAccount) {
    console.error('Firebase Admin: CRITICAL - Service account key not loaded (see previous logs), Firebase Admin App cannot be initialized.');
  } else if (!serviceAccount.project_id) {
    console.error('Firebase Admin: CRITICAL - Service account key was loaded but is missing project_id, Firebase Admin App cannot be initialized.');
  }
  // adminApp remains null
}

if (adminApp) {
  try {
    const databaseId = 'kkrdb'; // Explicitly target the 'kkrdb' database instance
    console.log(`Firebase Admin: Attempting to get Firestore instance for project: ${adminApp.options.projectId || 'N/A'}, using database ID: '${databaseId}'.`);
    adminDb = getFirestore(adminApp, databaseId);
    console.log(`Firebase Admin: Firestore instance obtained successfully for database '${databaseId}'.`);
  } catch (e: any) {
    console.error(`Firebase Admin: CRITICAL FAILURE - FAILED TO GET FIRESTORE INSTANCE for project ${adminApp.options.projectId || 'N/A'} and database 'kkrdb'. Often due to app initialization failure, Firestore not being enabled/provisioned in your Firebase project, OR the specified database ID ('kkrdb') does not exist or is not accessible with the current service account. Error: ${e.message}`, e.stack);
    adminDb = null;
  }
} else {
  if (serviceAccount || getApps().length === 0) {
    console.error('Firebase Admin: CRITICAL - Firebase Admin App not initialized (or initialization failed), cannot get Firestore instance. REVIEW PREVIOUS LOGS FOR THE ROOT CAUSE (e.g., service account key or app init errors).');
  }
  adminDb = null;
}

console.log(`Firebase Admin: Initialization complete. adminApp is ${adminApp ? `INITIALIZED (Project: ${adminApp.options.projectId || 'N/A'})` : 'NULL'}, adminDb is ${adminDb ? `INITIALIZED for database kkrdb (Database ID: ${adminDb.databaseId})` : 'NULL'}.`);

export { adminApp, adminDb, Timestamp, FieldValue };
