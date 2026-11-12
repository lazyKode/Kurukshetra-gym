// src/lib/firebase-admin.ts
console.log("Firebase Admin: Top of firebase-admin.ts executing..."); // NEW LOG

import {initializeApp, getApps, cert, type App as AdminAppType} from "firebase-admin/app";
import {getFirestore, Timestamp, FieldValue, type Firestore as AdminFirestoreType} from "firebase-admin/firestore";

console.log("Firebase Admin: Imports loaded.");

let serviceAccount: any;
let adminApp: AdminAppType | null = null;
let adminDb: AdminFirestoreType | null = null;

try {
  console.log("Firebase Admin: Attempting to load service account key from ../service-account-key.json");
  // Corrected path relative to src/lib/
  serviceAccount = require("../service-account-key.json");
  if (serviceAccount && serviceAccount.project_id) {
    console.log(`Firebase Admin: Service account key loaded successfully. Project ID: ${serviceAccount.project_id}`);
  } else {
    console.error("Firebase Admin: Service account key loaded but is invalid or missing project_id.");
    serviceAccount = null; // Ensure serviceAccount is null if invalid
  }
} catch (e: any) {
  console.error(`Firebase Admin: FAILED TO LOAD SERVICE ACCOUNT KEY. Path: ../service-account-key.json. Error: ${e.message}`, e.stack);
  serviceAccount = null; // Ensure serviceAccount is null on error
}

if (getApps().length) { // Use getApps() from firebase-admin/app
  adminApp = getApps()[0];
  if (adminApp) {
    console.log(`Firebase Admin: Re-using existing app instance for project: ${adminApp.options.projectId || "N/A"}.`);
  } else {
    // This case should theoretically not happen if getApps().length > 0,
    // but logging it defensively.
    console.error("Firebase Admin: Existing getApps()[0] is unexpectedly null/undefined. This might indicate a deeper issue with Firebase Admin SDK's internal state.");
  }
} else if (serviceAccount) {
  try {
    console.log("Firebase Admin: Attempting to initialize new Firebase app.");
    adminApp = initializeApp({ // Use initializeApp() from firebase-admin/app
      credential: cert(serviceAccount), // Use cert() from firebase-admin/app
    });
    console.log(`Firebase Admin: New app initialized successfully for project: ${adminApp.options.projectId || "N/A"}.`);
  } catch (e: any) {
    console.error(`Firebase Admin: FAILED TO INITIALIZE NEW APP. Error: ${e.message}`, e.stack);
    adminApp = null; // Ensure adminApp is null on error
  }
} else {
  console.error("Firebase Admin: Service account key not loaded or invalid, Firebase Admin App cannot be initialized.");
  // adminApp remains null
}

if (adminApp) {
  try {
    console.log("Firebase Admin: Attempting to get Firestore instance.");
    adminDb = getFirestore(adminApp); // Use getFirestore() from firebase-admin/firestore
    console.log("Firebase Admin: Firestore instance obtained successfully.");
  } catch (e: any) {
    console.error(`Firebase Admin: FAILED TO GET FIRESTORE INSTANCE. Error: ${e.message}`, e.stack);
    adminDb = null; // Ensure adminDb is null on error
  }
} else {
  // Only log this if we actually tried to initialize (i.e., serviceAccount was thought to be valid)
  // or if there were no existing apps.
  if (serviceAccount || getApps().length === 0) {
    console.error("Firebase Admin: Firebase Admin App not initialized (or initialization failed), cannot get Firestore instance.");
  }
  adminDb = null; // Ensure adminDb is null if adminApp isn't available
}

console.log(`Firebase Admin: Initialization complete. adminApp is ${adminApp ? "initialized" : "null"}, adminDb is ${adminDb ? "initialized" : "null"}.`);
export {adminApp, adminDb, Timestamp, FieldValue};
