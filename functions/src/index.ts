// src/index.ts
console.log("Firebase Functions: Top of index.ts executing..."); // NEW LOG

import {onRequest} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {Timestamp} from "firebase-admin/firestore";

console.log("Firebase Functions: Imports loaded in index.ts."); // NEW LOG

// No need to initialize Firebase Admin here if firebase-admin.ts handles it
// firebase-admin.ts will initialize the app and export the db instance

import {adminDb} from "./lib/firebase-admin"; // Assuming firebase-admin.ts is in lib


// Check if adminDb is initialized before use
if (!adminDb) {
  console.error("Firebase Functions: adminDb is not initialized in index.ts. Functions will likely fail.");
  // Depending on your error handling strategy, you might want to throw an error here
  // or implement a retry mechanism. For now, we'll just log.
} else {
  console.log("Firebase Functions: adminDb is initialized and ready to use in index.ts.");
}


export const helloWorld = onRequest((request, response) => {
  console.log("Hello logs!");
  response.send("Hello from Firebase!");
});


// Listens for new documents added to /members/:memberId
export const onNewMemberCreated = onDocumentCreated("members/{memberId}", async (event) => {
  console.log(`Firebase Functions: Triggered onDocumentCreated for member: ${event.params.memberId}`);

  const memberId = event.params.memberId;
  const snapshot = event.data;

  if (!snapshot) {
    console.log("Firebase Functions: No data associated with the event.");
    return;
  }

  const memberData = snapshot.data();

  if (!memberData) {
    console.log("Firebase Functions: Member data is empty.");
    return;
  }

  console.log(`Firebase Functions: New member data: ${JSON.stringify(memberData)}`);

  // Example: Automatically set a 'createdAt' timestamp if not present
  if (!memberData.createdAt) {
    if (adminDb) { // Check if adminDb is initialized
      const memberRef = adminDb.collection("members").doc(memberId); // Use adminDb
      try {
        await memberRef.update({
          createdAt: Timestamp.now(), // Use Timestamp from firebase-admin
        });
        console.log(`Firebase Functions: Added createdAt timestamp to member ${memberId}`);
      } catch (error) {
        console.error("Firebase Functions: Error adding createdAt timestamp:", error);
      }
    } else {
      console.error("Firebase Functions: adminDb is not initialized. Cannot add createdAt timestamp.");
    }
  }

  // Example: Create a welcome notification for the new member
  if (adminDb) { // Check if adminDb is initialized
    const notificationsRef = adminDb.collection("notifications"); // Use adminDb
    try {
      await notificationsRef.add({
        timestamp: Timestamp.now(), // Use Timestamp
        isRead: false,
      });
      console.log(`Firebase Functions: Created welcome notification for member ${memberId}`);
    } catch (error) {
      console.error("Firebase Functions: Error creating welcome notification:", error);
    }
  } else {
    console.error("Firebase Functions: adminDb is not initialized. Cannot create welcome notification.");
  }
});


// Example of a callable function (requires client-side implementation)
// import { CallableRequest, onCall } from "firebase-functions/v2/https";
// export const callableExample = onCall((request: CallableRequest) => {
//   // Access data from the client
//   const data = request.data;
//   console.log("Received callable request data:", data);

//   // Perform some action (e.g., interact with Firestore using adminDb)
//   // ...

//   // Send a response back to the client
//   return { result: "Callable function executed successfully!" };
// });
