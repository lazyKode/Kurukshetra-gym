
'use server';

import { adminApp, adminDb } from '@/lib/firebase-admin';
import { formSchema, type FormSchemaType as MemberFormDataType } from '@/lib/schemas/member-schema';
import type { StoredMember, ChangeRequest, NotificationType, PaymentConfirmationRequest, RegistrationIdReminderRequest, AccountStatus } from '@/lib/types/member-types';
import { Timestamp, FieldValue, type QueryDocumentSnapshot, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore';
import { format, parseISO, isValid, addMonths, addYears, addDays } from "date-fns";

const MEMBERS_COLLECTION_NAME = "kkrdb";
const CHANGE_REQUESTS_COLLECTION_NAME = "changeRequests";
const NOTIFICATIONS_COLLECTION_NAME = "notifications";
const PAYMENT_CONFIRMATIONS_COLLECTION_NAME = "paymentConfirmations";
const REGISTRATION_ID_REMINDERS_COLLECTION_NAME = "registrationIdReminders";

const getCriticalDbErrorMessage = (): string => {
  return `CRITICAL ERROR - Firestore adminDb instance is NOT AVAILABLE for database '${adminDb?.databaseId || 'UNKNOWN (adminDb null)'}'. Check Firebase Admin SDK initialization in 'src/lib/firebase-admin.ts'. This usually means the service account key is missing, invalid, or the Firebase app failed to initialize. Check server logs for details from 'firebase-admin.ts'.`;
};

const parseFirestoreDate = (dateValue: any): Date | undefined => {
  if (dateValue instanceof Timestamp) {
    return dateValue.toDate();
  }
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    return dateValue;
  }
  if (typeof dateValue === 'string') {
    const parsed = parseISO(dateValue);
    if (isValid(parsed)) return parsed;
  }
  if (dateValue && (typeof dateValue === 'string' || typeof dateValue === 'number')) {
    const d = new Date(dateValue);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }
  return undefined;
};

const mapDocToStoredMember = (docSnap: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): StoredMember | null => {
  if (!docSnap.exists) {
    return null;
  }
  const data = docSnap.data();
  if (!data) {
    return null;
  }

  const validAccountStatuses: AccountStatus[] = ['pending_initial_payment', 'active', 'inactive_payment_rejected', 'membership_expired', 'paused'];
  let accountStatus: AccountStatus = 'active';
  if (data.accountStatus && validAccountStatuses.includes(data.accountStatus as AccountStatus)) {
    accountStatus = data.accountStatus as AccountStatus;
  } else if (data.accountStatus) {
    console.warn(`mapDocToStoredMember: Invalid accountStatus '${data.accountStatus}' for member ${docSnap.id} in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Defaulting to 'active'.`);
  }

  return {
    newRegistrationId: docSnap.id,
    accountStatus: accountStatus,
    startDate: data.startDate ? parseFirestoreDate(data.startDate) : undefined,
    pauseDates: Array.isArray(data.pauseDates)
      ? data.pauseDates.map((pd: any) => parseFirestoreDate(pd)).filter((d): d is Date => d instanceof Date)
      : [],
    dateOfBirth: data.dateOfBirth ? parseFirestoreDate(data.dateOfBirth) : undefined,
    userName: data.userName || "",
    userEmail: data.userEmail || "",
    userPhoneNumber: data.userPhoneNumber || "",
    userPlan: data.userPlan ?? "Monthly Plan",
    endDate: data.endDate ? parseFirestoreDate(data.endDate) : undefined,
    customPlanDuration: data.customPlanDuration || "",
    customPlanPrice: data.customPlanPrice || "",
    userPhoto: data.userPhoto || "",
    canRequestProfileUpdates: data.canRequestProfileUpdates ?? true,
  };
};

const mapTimestampsToDatesInObject = <T extends Record<string, any>>(
  data: DocumentData,
  dateFields: string[] = []
): T => {
  const newDocData = { ...data } as T;
  dateFields.forEach(field => {
    if (field in data && data[field] instanceof Timestamp) {
      newDocData[field as keyof T] = (data[field] as Timestamp).toDate() as any;
    } else if (field in data && data[field]) {
      const parsedDate = parseFirestoreDate(data[field]);
      if (parsedDate) {
        newDocData[field as keyof T] = parsedDate as any;
      }
    }
  });
  return newDocData;
};

export async function addMemberToDb(values: MemberFormDataType): Promise<{ success: boolean; message: string; memberId?: string }> {
  if (!adminDb) {
    console.error(`Server Action (addMemberToDb): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (addMemberToDb): Received values for collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}':`, values);

  const validationResult = formSchema.safeParse(values);
  if (!validationResult.success) {
    console.error("Server Action (addMemberToDb): Validation failed:", validationResult.error.flatten());
    return { success: false, message: "Invalid member data received by the server." };
  }
  const memberFormData = validationResult.data;

  if (!memberFormData.newRegistrationId || typeof memberFormData.newRegistrationId !== 'string' || memberFormData.newRegistrationId.trim() === '') {
    console.error("Server Action (addMemberToDb): newRegistrationId is missing or invalid from form data.");
    return { success: false, message: "Registration ID is missing or invalid." };
  }
  const trimmedNewRegId = memberFormData.newRegistrationId.trim();

  const uniquenessCheck = await verifyRegistrationIdUniqueness(trimmedNewRegId);
  if (!uniquenessCheck.isUnique) {
    console.warn(`Server Action (addMemberToDb): Registration ID ${trimmedNewRegId} already exists or uniqueness check failed for database '${adminDb.databaseId}': ${uniquenessCheck.message}`);
    return { success: false, message: uniquenessCheck.message || `Registration ID ${trimmedNewRegId} already exists.` };
  }

  const { newRegistrationId, ...dataToStore } = memberFormData;

  const firestoreReadyData: { [key: string]: any } = {
    ...dataToStore,
    accountStatus: 'pending_initial_payment' as AccountStatus,
    canRequestProfileUpdates: true,
  };

  if (firestoreReadyData.startDate instanceof Date) {
    firestoreReadyData.startDate = Timestamp.fromDate(firestoreReadyData.startDate);
  } else if (firestoreReadyData.startDate) {
    const parsedStartDate = parseFirestoreDate(firestoreReadyData.startDate);
    firestoreReadyData.startDate = parsedStartDate ? Timestamp.fromDate(parsedStartDate) : FieldValue.serverTimestamp();
  } else {
    firestoreReadyData.startDate = FieldValue.serverTimestamp();
  }

  firestoreReadyData.endDate = firestoreReadyData.endDate ? Timestamp.fromDate(new Date(firestoreReadyData.endDate)) : null;
  firestoreReadyData.dateOfBirth = firestoreReadyData.dateOfBirth ? Timestamp.fromDate(new Date(firestoreReadyData.dateOfBirth)) : null;
  firestoreReadyData.pauseDates = Array.isArray(firestoreReadyData.pauseDates)
    ? firestoreReadyData.pauseDates.map((d: Date | string) => Timestamp.fromDate(new Date(d)))
    : [];

  delete firestoreReadyData.newRegistrationId;

  try {
    const membersCollectionRef = adminDb.collection(MEMBERS_COLLECTION_NAME);
    const docRef = membersCollectionRef.doc(trimmedNewRegId);
    await docRef.set(firestoreReadyData);
    console.log(`Server Action (addMemberToDb): Member "${memberFormData.userName}" (ID: ${trimmedNewRegId}, Status: ${firestoreReadyData.accountStatus}) added to Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'.`);

    let initialAmount = 0;
    switch (memberFormData.userPlan) {
        case "Monthly Plan": initialAmount = 800; break;
        case "3 Month Plan": initialAmount = 2000; break;
        case "6 Month Plan": initialAmount = 3600; break;
        case "Yearly Plan": initialAmount = 6000; break;
        case "Custom Plan":
            if (memberFormData.customPlanPrice && !isNaN(parseInt(memberFormData.customPlanPrice, 10))) {
                initialAmount = parseInt(memberFormData.customPlanPrice, 10);
            } else {
                console.warn(`Server Action (addMemberToDb): Custom Plan Price for member ${trimmedNewRegId} is invalid or empty ('${memberFormData.customPlanPrice}'). Defaulting amount to 0.`);
                initialAmount = 0;
            }
            break;
        default: initialAmount = 0;
    }
    console.log(`Server Action (addMemberToDb): Determined initialAmount: ${initialAmount} RS for plan '${memberFormData.userPlan}'.`);

    const paymentConfirmationRef = adminDb.collection(PAYMENT_CONFIRMATIONS_COLLECTION_NAME).doc();
    const newPaymentRequest: PaymentConfirmationRequest = {
        confirmationId: paymentConfirmationRef.id,
        memberId: trimmedNewRegId,
        memberName: memberFormData.userName,
        amount: initialAmount,
        paymentDate: Timestamp.now(),
        status: 'pending' as const,
    };
    console.log(`Server Action (addMemberToDb): Attempting to set payment confirmation request for member ${trimmedNewRegId} with ID ${paymentConfirmationRef.id} in collection '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}'. Data:`, JSON.stringify(newPaymentRequest));
    await paymentConfirmationRef.set(newPaymentRequest);
    console.log(`Server Action (addMemberToDb): Successfully created pending payment confirmation for new member ${trimmedNewRegId}, amount ${initialAmount} RS in database '${adminDb.databaseId}'. Request ID: ${paymentConfirmationRef.id}`);

    return { success: true, message: "Member added successfully and initial payment record created. Please check server logs for payment record details.", memberId: trimmedNewRegId };
  } catch (error: any) {
    if (error.message && (error.message.includes("paymentConfirmationRef.set") || error.message.includes(PAYMENT_CONFIRMATIONS_COLLECTION_NAME))) {
        console.error(
          `Server Action (addMemberToDb): CRITICAL ERROR creating payment confirmation request for member '${trimmedNewRegId}' in collection '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. This usually means Firestore permissions for this collection are missing or the service is unavailable.`,
          "\n  Error Message:", (error as Error).message,
          "\n  Error Code:", (error as any).code,
          "\n  Full Error Object:", error,
          "\n  Stack Trace:", (error as Error).stack
        );
        return { success: true, message: `Member added, but failed to create initial payment record. CRITICAL: Check server logs for Firestore errors regarding collection '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}'. Error: ${(error as Error).message}`, memberId: trimmedNewRegId };
    } else {
        console.error(
            `Server Action (addMemberToDb): CRITICAL ERROR adding member '${trimmedNewRegId}' to Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. This is likely a Firebase Admin SDK or Firestore permission/configuration issue.`,
            "\n  Error Message:", (error as Error).message,
            "\n  Error Code:", (error as any).code,
            "\n  Full Error Object:", error,
            "\n  Stack Trace:", (error as Error).stack
        );
        return { success: false, message: `Server Action Error: Failed to add member to Firestore. CRITICAL: Check your server terminal logs for detailed Firestore errors. Error: ${(error as Error).message}` };
    }
  }
}

export async function getMembersFromDb(): Promise<{ success: boolean; members?: StoredMember[]; message?: string }> {
  if (!adminDb) {
    console.error(`Server Action (getMembersFromDb): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (getMembersFromDb): Attempting to fetch members from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'.`);

  try {
    const membersCollectionRef = adminDb.collection(MEMBERS_COLLECTION_NAME);
    const querySnapshot = await membersCollectionRef.get();
    const members: StoredMember[] = [];

    querySnapshot.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
      try {
        const member = mapDocToStoredMember(docSnap);
        if (member !== null) {
          members.push(member);
        }
      } catch (mapError: any) {
        console.error(`Server Action (getMembersFromDb): Error mapping document ${docSnap.id} from collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Message: ${mapError.message}. Document data:`, docSnap.data(), "Stack:", mapError.stack);
      }
    });
    console.log(`Server Action (getMembersFromDb): Returning ${members.length} members from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'.`);
    return { success: true, members };
  } catch (error: any) {
    console.error(
      `Server Action (getMembersFromDb): CRITICAL ERROR fetching members from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. This is likely a Firebase Admin SDK or Firestore permission/configuration issue.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: "Server Action Error: Failed to fetch members from Firestore. CRITICAL: Check your server terminal logs for detailed Firestore errors (e.g., permissions, Admin SDK setup)." };
  }
}

export async function deleteMemberFromDb(memberId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (deleteMemberFromDb): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (deleteMemberFromDb): Attempting to delete member ID: ${memberId} from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  if (!memberId || typeof memberId !== 'string' || memberId.trim() === '') {
    console.warn("Server Action (deleteMemberFromDb): Invalid memberId received for deletion:", memberId);
    return { success: false, message: "Invalid Member ID format for deletion." };
  }

  try {
    const memberDocRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(memberId.trim());
    await memberDocRef.delete();
    console.log(`Server Action (deleteMemberFromDb): Member with ID ${memberId} deleted from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'.`);
    return { success: true, message: `Member with ID ${memberId} deleted successfully.` };
  } catch (error: any) {
    console.error(
      `Server Action (deleteMemberFromDb): CRITICAL ERROR deleting member '${memberId}' from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. This is likely a Firebase Admin SDK or Firestore permission/configuration issue.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to delete member with ID ${memberId}. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function verifyRegistrationIdUniqueness(registrationId: string): Promise<{ isUnique: boolean; message?: string; errorDetails?: any }> {
  if (!adminDb) {
    console.error(`Server Action (verifyRegistrationIdUniqueness): CRITICAL - ${getCriticalDbErrorMessage()}. Admin SDK might not be initialized for database '${MEMBERS_COLLECTION_NAME}'.`);
    return { isUnique: false, message: `Database connection error: Admin SDK not initialized for db '${MEMBERS_COLLECTION_NAME}'. Check server logs and 'firebase-admin.ts'.` };
  }

  if (adminApp && adminApp.options && adminApp.options.projectId) {
    console.log(`Server Action (verifyRegistrationIdUniqueness): Admin SDK initialized. TARGET PROJECT ID: ${adminApp.options.projectId}, TARGET DATABASE ID: ${adminDb.databaseId}. Checking ID: '${registrationId}' in collection '${MEMBERS_COLLECTION_NAME}'.`);
  } else {
    console.warn(`Server Action (verifyRegistrationIdUniqueness): adminApp or adminApp.options.projectId is not available. Cannot confirm target project ID. TARGET DATABASE ID: ${adminDb.databaseId}. Checking ID: '${registrationId}' in collection '${MEMBERS_COLLECTION_NAME}'.`);
  }

  if (!registrationId || typeof registrationId !== 'string' || registrationId.trim() === '') {
    console.warn("Server Action (verifyRegistrationIdUniqueness): Invalid registrationId (empty or not a string).");
    return { isUnique: false, message: "Invalid Registration ID format for uniqueness check." };
  }

  const trimmedRegistrationId = registrationId.trim();

  try {
    console.log(`Server Action (verifyRegistrationIdUniqueness): Attempting to get document at path: ${MEMBERS_COLLECTION_NAME}/${trimmedRegistrationId} in database '${adminDb.databaseId}'`);
    const docRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(trimmedRegistrationId);
    const docSnap = await docRef.get();
    console.log(`Server Action (verifyRegistrationIdUniqueness): For registrationId "${trimmedRegistrationId}", docSnap.exists is ${docSnap.exists}. Document data (if exists): ${docSnap.exists ? JSON.stringify(docSnap.data()) : 'N/A'}`);

    if (docSnap.exists) {
      return { isUnique: false, message: `Registration ID '${trimmedRegistrationId}' already exists in collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'.` };
    }
    return { isUnique: true };
  } catch (error: any) {
    console.error(
      `Server Action (verifyRegistrationIdUniqueness): CRITICAL ERROR during Firestore get() operation for uniqueness check for collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}' on ID '${trimmedRegistrationId}'. THIS IS A SERVER-SIDE FIREBASE ERROR. Review the error details below. Common causes: Firebase Admin SDK not initialized correctly (check logs from 'firebase-admin.ts'), service account permissions (IAM in Google Cloud for 'Cloud Datastore User' role), or Firestore not enabled/provisioned for database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    const errorMessage = `Server error checking ID '${trimmedRegistrationId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Firestore error: ${(error as Error).message || 'Unknown error'} (Code: ${(error as any).code || 'N/A'}). Consult server logs for detailed Firebase error.`;
    return { isUnique: false, message: errorMessage, errorDetails: error };
  }
}

export async function verifyMemberRegistrationId(registrationId: string): Promise<{ success: boolean; message: string; memberName?: string; memberId?: string; errorDetails?: any; attemptedPath?: string }> {
  if (!adminDb) {
    console.error(`Server Action (verifyMemberRegistrationId): CRITICAL - ${getCriticalDbErrorMessage()}. Admin SDK might not be initialized for database '${MEMBERS_COLLECTION_NAME}'.`);
    return { success: false, message: `Database connection error: Admin SDK not initialized for db '${MEMBERS_COLLECTION_NAME}'. Check server logs and 'firebase-admin.ts'.`, attemptedPath: `N/A (Admin SDK not initialized for db '${MEMBERS_COLLECTION_NAME}')` };
  }

  if (adminApp && adminApp.options && adminApp.options.projectId) {
    console.log(`Server Action (verifyMemberRegistrationId): Admin SDK initialized. TARGET PROJECT ID: ${adminApp.options.projectId}, TARGET DATABASE ID: ${adminDb.databaseId}. Verifying ID: '${registrationId}' in Firestore collection '${MEMBERS_COLLECTION_NAME}'`);
  } else {
    console.warn(`Server Action (verifyMemberRegistrationId): adminApp or adminApp.options.projectId is not available. Cannot confirm target project ID. TARGET DATABASE ID: ${adminDb.databaseId}. Verifying ID: '${registrationId}' in collection '${MEMBERS_COLLECTION_NAME}'.`);
  }

  if (!registrationId || typeof registrationId !== 'string' || registrationId.trim() === '') {
    console.warn("Server Action (verifyMemberRegistrationId): Invalid registrationId received for verification:", registrationId);
    return { success: false, message: "Invalid Registration ID format for verification.", attemptedPath: `N/A (Invalid ID format for db '${adminDb.databaseId}')` };
  }

  const trimmedRegistrationId = registrationId.trim();
  const attemptedPath = `${MEMBERS_COLLECTION_NAME}/${trimmedRegistrationId}`;

  try {
    console.log(`Server Action (verifyMemberRegistrationId): Attempting to access Firestore document at path: ${attemptedPath} in database '${adminDb.databaseId}'`);
    const memberDocRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(trimmedRegistrationId);
    const docSnap = await memberDocRef.get();

    if (docSnap.exists) {
      const memberData = mapDocToStoredMember(docSnap);
      if (!memberData) {
        console.error(`Server Action (verifyMemberRegistrationId): Document ${trimmedRegistrationId} found in database '${adminDb.databaseId}', but data is empty or invalid.`);
        return { success: false, message: "Member data is incomplete or corrupted. Please contact an administrator.", attemptedPath: attemptedPath };
      }
      console.log(`Server Action (verifyMemberRegistrationId): Reg ID ${trimmedRegistrationId} verified for member: ${memberData.userName} in database '${adminDb.databaseId}'`);
      return { success: true, message: "Registration ID verified.", memberName: memberData.userName, memberId: docSnap.id, attemptedPath: attemptedPath };
    } else {
      console.log(`Server Action (verifyMemberRegistrationId): Registration ID ${trimmedRegistrationId} not found in Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'. Firestore error code: 5 NOT_FOUND often means the document path does not exist.`);
      return { success: false, message: "Registration ID not found. Please check your ID and try again.", attemptedPath: attemptedPath };
    }
  } catch (error: any) {
    console.error(
      `Server Action (verifyMemberRegistrationId): CRITICAL ERROR verifying ID '${trimmedRegistrationId}' in Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. This is likely a Firebase Admin SDK or Firestore permission/configuration issue. Check service account key, IAM permissions, and if Firestore database '${adminDb?.databaseId || 'UNKNOWN_DB'}' is enabled. Firestore error code (if available): ${(error as any).code}`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `An unexpected server error occurred during member verification in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Firestore error: ${(error as Error).message || 'Unknown error'}. Please try again later or contact support.`, errorDetails: error, attemptedPath: attemptedPath };
  }
}

export async function getMemberByIdFromDb(id: string): Promise<{ success: boolean; member?: StoredMember; message?: string }> {
  if (!adminDb) {
    console.error(`Server Action (getMemberByIdFromDb): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (getMemberByIdFromDb): Attempting to fetch member by ID/Phone: ${id} from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  if (!id || typeof id !== 'string' || id.trim() === '') {
    console.warn("Server Action (getMemberByIdFromDb): Invalid ID (empty or not a string) received:", id);
    return { success: false, message: "Invalid ID format." };
  }

  const trimmedId = id.trim();

  try {
    // Attempt 1: Fetch by treating 'trimmedId' as a direct document ID (newRegistrationId)
    console.log(`Server Action (getMemberByIdFromDb): Attempt 1 - Fetching by direct document ID: ${trimmedId}`);
    const memberDocRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(trimmedId);
    const docSnap = await memberDocRef.get();

    if (docSnap.exists) {
      const member = mapDocToStoredMember(docSnap);
      if (member !== null) {
        console.log(`Server Action (getMemberByIdFromDb): Member found by direct ID: ${member.userName} (ID: ${trimmedId}) in database '${adminDb.databaseId}'`);
        return { success: true, member: member };
      } else {
        // Document found by ID, but mapping failed. This is a data integrity issue for this specific member.
        console.error(`Server Action (getMemberByIdFromDb): Document ${trimmedId} found by direct ID, but data is empty or invalid after mapping. Member data might be corrupted.`);
        return { success: false, message: `Member data for ID ${trimmedId} could not be processed. It might be corrupted. Please contact support.` };
      }
    } else {
      // Document not found by direct ID, now proceed to phone lookup
      console.log(`Server Action (getMemberByIdFromDb): Member with direct ID ${trimmedId} not found. Proceeding to Attempt 2 (phone lookup).`);
    }

    // Attempt 2: If not found by direct ID, try fetching by 'userPhoneNumber' field
    // This assumes 'trimmedId' might be a phone number.
    // Ensure you have an index on 'userPhoneNumber' in Firestore for this query.
    console.log(`Server Action (getMemberByIdFromDb): Attempt 2 - Fetching by userPhoneNumber field: ${trimmedId}. Ensure Firestore index exists on 'userPhoneNumber'.`);
    const membersCollectionRef = adminDb.collection(MEMBERS_COLLECTION_NAME);
    const phoneQuery = membersCollectionRef.where("userPhoneNumber", "==", trimmedId).limit(1);
    const phoneQuerySnapshot = await phoneQuery.get();

    if (!phoneQuerySnapshot.empty) {
      const memberDocFromPhoneQuery = phoneQuerySnapshot.docs[0];
      const member = mapDocToStoredMember(memberDocFromPhoneQuery);
      if (member !== null) {
        console.log(`Server Action (getMemberByIdFromDb): Member found by userPhoneNumber ${trimmedId}: ${member.userName} (Actual ID: ${memberDocFromPhoneQuery.id}) in database '${adminDb.databaseId}'`);
        return { success: true, member: member };
      } else {
         console.error(`Server Action (getMemberByIdFromDb): Document found by phone number ${trimmedId}, but data is empty or invalid after mapping.`);
        return { success: false, message: `Member data found for phone ${trimmedId}, but is incomplete or corrupted.` };
      }
    } else {
      console.log(`Server Action (getMemberByIdFromDb): Member with userPhoneNumber ${trimmedId} not found in database '${adminDb.databaseId}'.`);
      return { success: false, message: "Member not found by ID or Phone Number." };
    }

  } catch (error: any) {
    console.error(
      `Server Action (getMemberByIdFromDb): CRITICAL ERROR fetching member '${trimmedId}' by ID/Phone from Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. This is likely a Firebase Admin SDK or Firestore permission/configuration issue.`,
      "\\n  Error Message:", (error as Error).message,
      "\\n  Error Code:", (error as any).code,
      "\\n  Full Error Object:", error,
      "\\n  Stack Trace:", (error as Error).stack
    );
    if ((error as any).code === 'FAILED_PRECONDITION' && (error as Error).message.includes('index')) {
        console.error(`Server Action (getMemberByIdFromDb): FAILED_PRECONDITION error strongly suggests a missing Firestore index for the query on 'userPhoneNumber'. Please create this index in your Firebase console for collection '${MEMBERS_COLLECTION_NAME}'.`);
        return { success: false, message: `Database query failed. A required index on 'userPhoneNumber' might be missing. Please contact support.`};
    }
    return { success: false, message: `Server Action Error: Failed to fetch member with ID/Phone ${trimmedId} from database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

const getMaxPauseDaysForPlan = (plan: StoredMember['userPlan'] | undefined): number => {
  if (!plan) return 0;
  switch (plan) {
    case "Monthly Plan": return 2;
    case "3 Month Plan": return 7;
    case "6 Month Plan": return 15; // Added 6 Month Plan
    case "Yearly Plan": return 30;
    default: return 0;
  }
};

export async function updateMemberPauseDates(registrationId: string, newPauseDates: Date[]): Promise<{ success: boolean; message: string; member?: StoredMember }> {
  if (!adminDb) {
    console.error(`Server Action (updateMemberPauseDates): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (updateMemberPauseDates): Updating for ID: ${registrationId} in database '${adminDb.databaseId}', Dates:`, newPauseDates);

  if (!registrationId || typeof registrationId !== 'string' || registrationId.trim() === '') {
    console.warn("Server Action (updateMemberPauseDates): Invalid registrationId.");
    return { success: false, message: "Invalid Registration ID." };
  }

  const trimmedRegistrationId = registrationId.trim();
  try {
    const memberResult = await getMemberByIdFromDb(trimmedRegistrationId);
    if (!memberResult.success || !memberResult.member) {
      return { success: false, message: memberResult.message || `Member with ID ${trimmedRegistrationId} not found in database '${adminDb.databaseId}'.` };
    }
    const member = memberResult.member;

    if (member.userPlan === "Custom Plan") {
      return { success: false, message: "Pause days cannot be updated for Custom Plans." };
    }
    const maxPauseDays = getMaxPauseDaysForPlan(member.userPlan);
    if (newPauseDates.length > maxPauseDays) {
      return { success: false, message: `Number of pause days (${newPauseDates.length}) exceeds max (${maxPauseDays}).` };
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startDate = (member.startDate) ? new Date(member.startDate) : today; startDate.setHours(0, 0, 0, 0);

    for (const pauseDate of newPauseDates) {
      const normalizedPauseDate = new Date(pauseDate); normalizedPauseDate.setHours(0, 0, 0, 0);
      if (normalizedPauseDate < startDate) {
        return { success: false, message: `Pause date ${format(new Date(pauseDate), "PPP")} cannot be before start date ${format(startDate, "PPP")}.` };
      }
    }

    const memberDocRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(trimmedRegistrationId);
    await memberDocRef.update({ pauseDates: newPauseDates.map(d => Timestamp.fromDate(d)) });

    const updatedMemberResult = await getMemberByIdFromDb(trimmedRegistrationId);
    if (!updatedMemberResult.success || !updatedMemberResult.member) {
      throw new Error("Failed to fetch member after pause date update.");
    }
    console.log(`Server Action (updateMemberPauseDates): Pause dates updated for ${updatedMemberResult.member.userName} in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Pause dates updated successfully.", member: updatedMemberResult.member };
  } catch (error: any) {
    console.error(
      `Server Action (updateMemberPauseDates): CRITICAL ERROR updating pause dates for '${trimmedRegistrationId}' in Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to update pause dates in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function updateMemberPhoto(registrationId: string, photoDataUri: string): Promise<{ success: boolean; message: string; member?: StoredMember }> {
  if (!adminDb) {
    console.error(`Server Action (updateMemberPhoto): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (updateMemberPhoto): Updating photo for ID: ${registrationId} in database '${adminDb.databaseId}'`);

  if (!registrationId || typeof registrationId !== 'string' || registrationId.trim() === '') {
    console.warn("Server Action (updateMemberPhoto): Invalid registrationId.");
    return { success: false, message: "Invalid Registration ID." };
  }
  if (photoDataUri && !photoDataUri.startsWith("data:image/") && photoDataUri !== "") {
    return { success: false, message: "Invalid photo data format." };
  }

  const trimmedRegistrationId = registrationId.trim();
  try {
    const memberDocRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(trimmedRegistrationId);
    await memberDocRef.update({ userPhoto: photoDataUri });

    const updatedMemberResult = await getMemberByIdFromDb(trimmedRegistrationId);
    if (!updatedMemberResult.success || !updatedMemberResult.member) {
      throw new Error("Failed to fetch member after photo update.");
    }
    console.log(`Server Action (updateMemberPhoto): Photo updated for member ${updatedMemberResult.member.userName} in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Photo updated successfully.", member: updatedMemberResult.member };
  } catch (error: any) {
    console.error(
      `Server Action (updateMemberPhoto): CRITICAL ERROR updating photo for '${trimmedRegistrationId}' in Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to update photo in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function updateMemberInDb(currentRegistrationId: string, updatedValues: MemberFormDataType): Promise<{ success: boolean; message: string; member?: StoredMember; newMemberId?: string }> {
  if (!adminDb) {
    console.error(`Server Action (updateMemberInDb): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (updateMemberInDb): Updating member ID: ${currentRegistrationId} in database '${adminDb.databaseId}'`, updatedValues);

  if (!currentRegistrationId || typeof currentRegistrationId !== 'string' || currentRegistrationId.trim() === '') {
    console.warn("Server Action (updateMemberInDb): Invalid currentRegistrationId received:", currentRegistrationId);
    return { success: false, message: "Invalid current Registration ID." };
  }

  const validationResult = formSchema.safeParse(updatedValues);
  if (!validationResult.success) {
    console.error("Server Action (updateMemberInDb): Validation failed:", validationResult.error.flatten());
    return { success: false, message: "Invalid member data for update." };
  }
  const memberDataFromForm = validationResult.data;
  const trimmedCurrentRegId = currentRegistrationId.trim();

  const { newRegistrationId: formRegId, ...dataToStore } = memberDataFromForm;

  const firestoreReadyData: { [key: string]: any } = { ...dataToStore };

  if (firestoreReadyData.startDate instanceof Date) firestoreReadyData.startDate = Timestamp.fromDate(firestoreReadyData.startDate);
  else if (firestoreReadyData.startDate) firestoreReadyData.startDate = Timestamp.fromDate(new Date(firestoreReadyData.startDate));

  firestoreReadyData.endDate = firestoreReadyData.endDate ? Timestamp.fromDate(new Date(firestoreReadyData.endDate)) : null;
  firestoreReadyData.dateOfBirth = firestoreReadyData.dateOfBirth ? Timestamp.fromDate(new Date(firestoreReadyData.dateOfBirth)) : null;
  firestoreReadyData.pauseDates = Array.isArray(firestoreReadyData.pauseDates) ? firestoreReadyData.pauseDates.map((d: Date | string) => Timestamp.fromDate(new Date(d))) : [];

  delete firestoreReadyData.newRegistrationId;

  try {
    const membersCollectionRef = adminDb.collection(MEMBERS_COLLECTION_NAME);
    if (!formRegId || typeof formRegId !== 'string' || formRegId.trim() === '') {
      console.error("Server Action (updateMemberInDb): formRegId (newRegistrationId from form) is missing or invalid.");
      return { success: false, message: "New Registration ID from form is missing or invalid." };
    }

    const trimmedFormRegId = formRegId.trim();

    if (trimmedFormRegId !== trimmedCurrentRegId) {
      const uniquenessCheck = await verifyRegistrationIdUniqueness(trimmedFormRegId);
      if (!uniquenessCheck.isUnique) {
        console.warn(`Server Action (updateMemberInDb): New Registration ID ${trimmedFormRegId} already exists or uniqueness check failed for database '${adminDb.databaseId}'.`);
        return { success: false, message: uniquenessCheck.message || `New Registration ID ${trimmedFormRegId} is already in use.` };
      }

      const currentMemberDocRef = membersCollectionRef.doc(trimmedCurrentRegId);
      const currentMemberSnap = await currentMemberDocRef.get();
      if (!currentMemberSnap.exists) {
        return { success: false, message: `Original member document ${trimmedCurrentRegId} not found in database '${adminDb.databaseId}'. Cannot update.` };
      }
      const fullExistingData = currentMemberSnap.data() || {};
      const dataForNewDoc = {
        ...fullExistingData,
        ...firestoreReadyData,
        accountStatus: firestoreReadyData.accountStatus ?? fullExistingData.accountStatus ?? 'active',
        canRequestProfileUpdates: firestoreReadyData.canRequestProfileUpdates ?? fullExistingData.canRequestProfileUpdates ?? true
      };

      const newDocRef = membersCollectionRef.doc(trimmedFormRegId);
      await newDocRef.set(dataForNewDoc);
      await currentMemberDocRef.delete();
      console.log(`Server Action (updateMemberInDb): Member ${trimmedCurrentRegId} data moved to new ID ${trimmedFormRegId} in database '${adminDb.databaseId}'.`);
      const finalMemberDataResult = await getMemberByIdFromDb(trimmedFormRegId);
      return { success: true, message: "Member updated successfully (ID changed).", member: finalMemberDataResult.member, newMemberId: trimmedFormRegId };
    } else {
      const memberDocRef = membersCollectionRef.doc(trimmedCurrentRegId);
      await memberDocRef.update(firestoreReadyData);
      console.log(`Server Action (updateMemberInDb): Member (ID ${trimmedCurrentRegId}) updated in database '${adminDb.databaseId}'.`);
      const updatedMemberResult = await getMemberByIdFromDb(trimmedCurrentRegId);
      return { success: true, message: "Member updated successfully.", member: updatedMemberResult.member };
    }
  } catch (error: any) {
    let errorCode: string | undefined;
    if (typeof error === 'object' && error !== null && 'code' in error) {
      errorCode = (error as any).code as string;
    }
    console.error(`Server Action (updateMemberInDb): CRITICAL ERROR updating member '${currentRegistrationId}' in Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Raw error:`, error, "Message:", (error as Error).message, "Code:", errorCode, "Stack Trace:", (error as Error).stack);
    return { success: false, message: `Server Action Error: Failed to update member in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function submitProfileUpdateRequest(
  memberId: string,
  fieldName: ChangeRequest['fieldName'],
  requestedValue: string
): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (submitProfileUpdateRequest): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (submitProfileUpdateRequest): For memberId '${memberId}' in database '${adminDb.databaseId}', field '${fieldName}', value '${requestedValue}'`);

  try {
    const memberSnap = await adminDb.collection(MEMBERS_COLLECTION_NAME).doc(memberId).get();
    if (!memberSnap.exists) {
      return { success: false, message: "Member not found." };
    }
    const memberData = memberSnap.data();
    if (!memberData) return { success: false, message: "Member data is empty." };

    let currentValue: string = "";
    switch (fieldName) {
        case 'userName': currentValue = memberData.userName || ""; break;
        case 'userEmail': currentValue = memberData.userEmail || ""; break;
        case 'userPhoneNumber': currentValue = memberData.userPhoneNumber || ""; break;
        case 'userPlan': currentValue = memberData.userPlan || ""; break;
        case 'startDate':
            const startDateVal = memberData.startDate ? parseFirestoreDate(memberData.startDate) : null;
            currentValue = startDateVal ? format(startDateVal, 'yyyy-MM-dd') : "N/A";
            break;
        default:
          const exhaustiveCheck: never = fieldName; // Ensures all cases are handled
          return { success: false, message: `Invalid field name: ${exhaustiveCheck}` };
    }

    const newRequestRef = adminDb.collection(CHANGE_REQUESTS_COLLECTION_NAME).doc();
    const newRequest: ChangeRequest = {
      requestId: newRequestRef.id,
      memberId,
      memberName: memberData.userName || "N/A",
      fieldName,
      currentValue,
      requestedValue,
      requestDate: Timestamp.now(),
    };
    await newRequestRef.set(newRequest);
    console.log(`Server Action (submitProfileUpdateRequest): Request submitted for member ${memberId} in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Profile update request submitted successfully." };
  } catch (error: any) {
    console.error(
      `Server Action (submitProfileUpdateRequest): CRITICAL ERROR creating profile update request for '${memberId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to submit request. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function getProfileUpdateRequests(): Promise<{ success: boolean; requests?: (ChangeRequest & { requestId: string })[]; message?: string }> {
  if (!adminDb) {
    console.error(`Server Action (getProfileUpdateRequests): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (getProfileUpdateRequests): Fetching from '${CHANGE_REQUESTS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    const snapshot = await adminDb.collection(CHANGE_REQUESTS_COLLECTION_NAME).orderBy("requestDate", "desc").get();
    const requests: (ChangeRequest & { requestId: string })[] = [];
    snapshot.forEach(doc => {
      try {
        const data = doc.data();
        requests.push(mapTimestampsToDatesInObject({ ...data, requestId: doc.id }, ['requestDate']) as ChangeRequest & { requestId: string });
      } catch (mapError: any) {
        console.error(`Server Action (getProfileUpdateRequests): Error mapping document ${doc.id} from collection '${CHANGE_REQUESTS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Error: ${mapError.message}. Data:`, doc.data(), "Stack:", mapError.stack);
      }
    });
    console.log(`Server Action (getProfileUpdateRequests): Returning ${requests.length} requests from database '${adminDb.databaseId}'.`);
    return { success: true, requests };
  } catch (error: any) {
    console.error(
      `Server Action (getProfileUpdateRequests): CRITICAL ERROR fetching profile update requests from database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to fetch requests. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function dismissProfileUpdateRequest(requestId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (dismissProfileUpdateRequest): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (dismissProfileUpdateRequest): Dismissing '${requestId}' from '${CHANGE_REQUESTS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    await adminDb.collection(CHANGE_REQUESTS_COLLECTION_NAME).doc(requestId).delete();
    console.log(`Server Action (dismissProfileUpdateRequest): Request ${requestId} dismissed in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Request dismissed successfully." };
  } catch (error: any) {
    console.error(
      `Server Action (dismissProfileUpdateRequest): CRITICAL ERROR dismissing request '${requestId}' from database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to dismiss request. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function sendNotificationToMember(targetMemberId: string, message: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (sendNotificationToMember): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (sendNotificationToMember): Sending to '${targetMemberId}' via collection '${NOTIFICATIONS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    const newNotificationRef = adminDb.collection(NOTIFICATIONS_COLLECTION_NAME).doc();
    const newNotification: NotificationType = {
      notificationId: newNotificationRef.id,
      memberId: targetMemberId,
      senderName: "Admin",
      message,
      timestamp: Timestamp.now(),
      isRead: false,
    };
    await newNotificationRef.set(newNotification);
    console.log(`Server Action (sendNotificationToMember): Notification sent to ${targetMemberId} in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Notification sent successfully." };
  } catch (error: any) {
    console.error(
      `Server Action (sendNotificationToMember): CRITICAL ERROR sending notification to '${targetMemberId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to send notification. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function getNotificationsForMember(memberId: string): Promise<{ success: boolean; notifications?: (NotificationType & { notificationId: string })[]; message?: string }> {
  if (!adminDb) {
    console.error(`Server Action (getNotificationsForMember): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (getNotificationsForMember): Fetching for '${memberId}' from '${NOTIFICATIONS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    const snapshot = await adminDb.collection(NOTIFICATIONS_COLLECTION_NAME)
      .where("memberId", "==", memberId)
      .orderBy("timestamp", "desc")
      .get();
    const notifications: (NotificationType & { notificationId: string })[] = [];
    snapshot.forEach(doc => {
      try {
        const data = doc.data();
        notifications.push(mapTimestampsToDatesInObject({ ...data, notificationId: doc.id }, ['timestamp']) as NotificationType & { notificationId: string });
      } catch (mapError: any)
      {
        console.error(`Server Action (getNotificationsForMember): Error mapping document ${doc.id} from '${NOTIFICATIONS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Error: ${mapError.message}. Data:`, doc.data(), "Stack:", mapError.stack);
      }
    });
    console.log(`Server Action (getNotificationsForMember): Returning ${notifications.length} notifications for member ${memberId} from database '${adminDb.databaseId}'.`);
    return { success: true, notifications };
  } catch (error: any) {
    console.error(
      `Server Action (getNotificationsForMember): CRITICAL ERROR fetching notifications for '${memberId}' from database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Error: ${(error as Error).message}. Check Firestore indexes if it's a FAILED_PRECONDITION.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to fetch notifications. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function markMemberNotificationsAsRead(memberId: string): Promise<{ success: boolean; message?: string }> {
  if (!adminDb) {
    console.error(`Server Action (markMemberNotificationsAsRead): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (markMemberNotificationsAsRead): Marking for '${memberId}' in '${NOTIFICATIONS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    const snapshot = await adminDb.collection(NOTIFICATIONS_COLLECTION_NAME)
      .where("memberId", "==", memberId)
      .where("isRead", "==", false)
      .get();

    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { isRead: true });
    });
    await batch.commit();
    console.log(`Server Action (markMemberNotificationsAsRead): ${snapshot.size} notifications marked as read for member ${memberId} in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Notifications marked as read." };
  } catch (error: any) {
    console.error(
      `Server Action (markMemberNotificationsAsRead): CRITICAL ERROR marking notifications as read for '${memberId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to mark notifications as read. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function toggleProfileUpdatePermission(memberId: string, enable: boolean): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (toggleProfileUpdatePermission): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (toggleProfileUpdatePermission): Toggling for '${memberId}' to ${enable} in '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    await adminDb.collection(MEMBERS_COLLECTION_NAME).doc(memberId).update({ canRequestProfileUpdates: enable });
    console.log(`Server Action (toggleProfileUpdatePermission): Permission updated for ${memberId} in database '${adminDb.databaseId}'.`);
    return { success: true, message: `Profile update requests ${enable ? "enabled" : "disabled"} for member.` };
  } catch (error: any) {
    console.error(
      `Server Action (toggleProfileUpdatePermission): CRITICAL ERROR toggling permission for '${memberId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to update permission. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function requestPaymentConfirmation(memberId: string, amount: number): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (requestPaymentConfirmation): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (requestPaymentConfirmation): Requesting for '${memberId}', amount ${amount} in '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    const memberSnap = await adminDb.collection(MEMBERS_COLLECTION_NAME).doc(memberId).get();
    if (!memberSnap.exists) {
      return { success: false, message: "Member not found to request payment confirmation." };
    }
    const memberData = memberSnap.data();
    if (!memberData) return { success: false, message: "Member data is empty for payment confirmation." };

    const newConfirmationRef = adminDb.collection(PAYMENT_CONFIRMATIONS_COLLECTION_NAME).doc();
    const newConfirmation: PaymentConfirmationRequest = {
      confirmationId: newConfirmationRef.id,
      memberId,
      memberName: memberData.userName || "N/A",
      amount,
      paymentDate: Timestamp.now(),
      status: 'pending' as const,
    };
    await newConfirmationRef.set(newConfirmation);
    console.log(`Server Action (requestPaymentConfirmation): Confirmation requested for member ${memberId} in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Admin has been notified of your payment. It will be confirmed shortly." };
  } catch (error: any) {
    console.error(
      `Server Action (requestPaymentConfirmation): CRITICAL ERROR creating payment confirmation for '${memberId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to notify admin of payment. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function getPendingPaymentConfirmations(): Promise<{ success: boolean; requests?: (PaymentConfirmationRequest & { confirmationId: string })[]; message?: string }> {
  if (!adminDb) {
    console.error(`Server Action (getPendingPaymentConfirmations): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (getPendingPaymentConfirmations): Checking adminDb instance before query for database '${adminDb.databaseId}'. Collection: '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}'`);

  try {
    console.log(`Server Action (getPendingPaymentConfirmations): Attempting to query collection '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}' in database '${adminDb.databaseId}' for status 'pending', ordered by 'paymentDate' asc.`);
    const snapshot = await adminDb.collection(PAYMENT_CONFIRMATIONS_COLLECTION_NAME)
      .where("status", "==", "pending")
      .orderBy("paymentDate", "asc")
      .get();

    console.log(`Server Action (getPendingPaymentConfirmations): Firestore query completed. Found ${snapshot.size} documents with status 'pending'.`);

    const requests: (PaymentConfirmationRequest & { confirmationId: string })[] = [];
    snapshot.forEach(doc => {
      console.log(`Server Action (getPendingPaymentConfirmations): Processing document ID: ${doc.id}, Status: ${doc.data().status}, Payment Date: ${doc.data().paymentDate}`);
      try {
        const data = doc.data();
        requests.push(mapTimestampsToDatesInObject({ ...data, confirmationId: doc.id }, ['paymentDate']) as PaymentConfirmationRequest & { confirmationId: string });
      } catch (mapError: any) {
        console.error(`Server Action (getPendingPaymentConfirmations): Error mapping document ${doc.id} from '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Error: ${mapError.message}. Data:`, doc.data(), "Stack:", mapError.stack);
      }
    });
    console.log(`Server Action (getPendingPaymentConfirmations): Returning ${requests.length} pending confirmations from database '${adminDb.databaseId}'.`);
    return { success: true, requests };
  } catch (error: any) {
    console.error(
      `Server Action (getPendingPaymentConfirmations): CRITICAL ERROR fetching pending payment confirmations from database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Error: ${(error as Error).message}. Check Firestore indexes for collection '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}' (fields: status ASC, paymentDate ASC) if it's a FAILED_PRECONDITION.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
      );
    return { success: false, message: "Server Action Error: Failed to fetch pending payment confirmations. CRITICAL: Check server logs. This often indicates a missing Firestore index for the 'paymentConfirmations' collection (fields: status ASC, paymentDate ASC)." };
  }
}

export async function confirmPayment(confirmationId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (confirmPayment): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (confirmPayment): Confirming '${confirmationId}' in '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}' and updating member in '${MEMBERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    const confirmationRef = adminDb.collection(PAYMENT_CONFIRMATIONS_COLLECTION_NAME).doc(confirmationId);
    const confirmationSnap = await confirmationRef.get();

    if (!confirmationSnap.exists) {
      return { success: false, message: "Payment confirmation request not found." };
    }
    const confirmationData = confirmationSnap.data() as PaymentConfirmationRequest;
    if (!confirmationData) {
      console.error("Server Action (confirmPayment): Confirmation data is undefined for ID:", confirmationId);
      return { success: false, message: "Payment confirmation data is invalid." };
    }

    const memberRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(confirmationData.memberId);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      await confirmationRef.update({ status: 'rejected', notes: 'Member record not found during confirmation.' });
      console.warn(`Server Action (confirmPayment): Member ${confirmationData.memberId} not found in database '${adminDb.databaseId}' during payment confirmation. Payment rejected.`);
      return { success: false, message: "Member associated with this payment not found. Payment rejected." };
    }
    const memberData = memberSnap.data();
    if (!memberData) {
        await confirmationRef.update({ status: 'rejected', notes: 'Member data is empty during confirmation.' });
        console.warn(`Server Action (confirmPayment): Member data empty for ${confirmationData.memberId} in database '${adminDb.databaseId}'. Payment rejected.`);
        return { success: false, message: "Member data associated with this payment is empty. Payment rejected." };
    }

    const memberUpdateData: { accountStatus: AccountStatus; startDate?: Timestamp; pauseDates?: any[]; endDate?: null } = {
      accountStatus: 'active'
    };
    if (memberData.userPlan !== "Custom Plan") {
      memberUpdateData.startDate = Timestamp.now();
      memberUpdateData.pauseDates = [];
      memberUpdateData.endDate = null;
    }

    await memberRef.update(memberUpdateData);
    await confirmationRef.update({ status: 'confirmed' });

    await sendNotificationToMember(confirmationData.memberId, `Your payment of ${confirmationData.amount}RS has been confirmed and your membership updated.`);
    console.log(`Server Action (confirmPayment): Payment ${confirmationId} confirmed for member ${confirmationData.memberId}, status set to 'active' in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Payment confirmed, member updated, and notification sent." };
  } catch (error: any) {
    console.error(
      `Server Action (confirmPayment): CRITICAL ERROR confirming payment '${confirmationId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to confirm payment. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function rejectPayment(confirmationId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (rejectPayment): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (rejectPayment): Rejecting '${confirmationId}' in '${PAYMENT_CONFIRMATIONS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);

  try {
    const confirmationRef = adminDb.collection(PAYMENT_CONFIRMATIONS_COLLECTION_NAME).doc(confirmationId);
    const confirmationSnap = await confirmationRef.get();

    if (!confirmationSnap.exists) {
      return { success: false, message: "Payment confirmation request not found." };
    }
    const confirmationData = confirmationSnap.data() as PaymentConfirmationRequest;
    if (!confirmationData) {
      console.error("Server Action (rejectPayment): Confirmation data is undefined for ID:", confirmationId);
      return { success: false, message: "Payment confirmation data is invalid." };
    }

    await confirmationRef.update({ status: 'rejected' });

    const memberRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(confirmationData.memberId);
    await memberRef.update({ accountStatus: 'inactive_payment_rejected' });

    await sendNotificationToMember(confirmationData.memberId, `Your recent payment confirmation request for ${confirmationData.amount}RS could not be verified and has been rejected. Please contact support.`);
    console.log(`Server Action (rejectPayment): Payment ${confirmationId} rejected for member ${confirmationData.memberId}, status set to 'inactive_payment_rejected' in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Payment rejected and notification sent." };
  } catch (error: any) {
    console.error(
      `Server Action (rejectPayment): CRITICAL ERROR rejecting payment '${confirmationId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to reject payment. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function submitRegistrationIdReminder(identifier: string, identifierType: 'email' | 'phone'): Promise<{ success: boolean; message: string; reminderId?: string }> {
  if (!adminDb) {
    console.error(`Server Action (submitRegistrationIdReminder): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (submitRegistrationIdReminder): Received request for type \'${identifierType}\', identifier \'${identifier}\' in database \'${adminDb.databaseId}\'`);

  if (!identifier || identifier.trim() === '') {
    return { success: false, message: `The ${identifierType} provided is empty.` };
  }

  const trimmedIdentifier = identifier.trim();

  try {
    let memberFound = false;
    let memberName = "N/A";
    let matchedMemberId = "";

    if (identifierType === 'phone') {
      const membersQuery = adminDb.collection(MEMBERS_COLLECTION_NAME).where("userPhoneNumber", "==", trimmedIdentifier);
      const querySnapshot = await membersQuery.get();

      if (querySnapshot.empty) {
        console.log(`Server Action (submitRegistrationIdReminder): No member found with phone number \'${trimmedIdentifier}\' in database \'${adminDb.databaseId}\'. Request not created.`);
        return { success: false, message: "Phone number not found in our records. Please ensure you entered it correctly or contact support if you believe this is an error." };
      } else {
        memberFound = true;
        const firstMatch = querySnapshot.docs[0];
        matchedMemberId = firstMatch.id;
        memberName = firstMatch.data()?.userName || "N/A";
        console.log(`Server Action (submitRegistrationIdReminder): Phone number \'${trimmedIdentifier}\' matched for member ID \'${matchedMemberId}\' (Name: ${memberName}). Proceeding to create reminder request.`);
      }
    } else if (identifierType === 'email') {
      const membersQuery = adminDb.collection(MEMBERS_COLLECTION_NAME).where("userEmail", "==", trimmedIdentifier);
      const querySnapshot = await membersQuery.get();
      if (querySnapshot.empty) {
        console.log(`Server Action (submitRegistrationIdReminder): No member found with email \'${trimmedIdentifier}\' in database \'${adminDb.databaseId}\'. Request not created.`);
        return { success: false, message: "Email address not found in our records. Please ensure you entered it correctly or contact support." };
      } else {
        memberFound = true;
        const firstMatch = querySnapshot.docs[0];
        matchedMemberId = firstMatch.id;
        memberName = firstMatch.data()?.userName || "N/A";
        console.log(`Server Action (submitRegistrationIdReminder): Email \'${trimmedIdentifier}\' matched for member ID \'${matchedMemberId}\' (Name: ${memberName}). Proceeding to create reminder request.`);
      }
    } else {
      // Should not happen based on type signature, but good for robustness
      console.warn(`Server Action (submitRegistrationIdReminder): Invalid identifierType \'${identifierType}\'.`);
      return { success: false, message: "Invalid identifier type specified." };
    }

    // If memberFound is true, proceed to create the reminder
    if (memberFound) {
      const newReminderRef = adminDb.collection(REGISTRATION_ID_REMINDERS_COLLECTION_NAME).doc();
      // Base reminder structure, consistent with RegistrationIdReminderRequest type
      const newReminder: RegistrationIdReminderRequest = {
        reminderId: newReminderRef.id,
        identifier: trimmedIdentifier,
        identifierType,
        status: 'pending',
        requestDate: Timestamp.now(),
        // Note: matchedMemberId and memberName are not part of the formal RegistrationIdReminderRequest type from member-types.ts
        // but will be saved to Firestore and accessible in the admin dashboard.
      };

      // Add matched member details to the Firestore document.
      // The getPendingRegistrationIdReminders function will pick these up.
      const reminderDataToStore = {
        ...newReminder,
        matchedMemberId: matchedMemberId,
        matchedMemberName: memberName,
      };

      await newReminderRef.set(reminderDataToStore);
      console.log(`Server Action (submitRegistrationIdReminder): Reminder request for \'${identifierType}: ${trimmedIdentifier}\' stored with ID ${newReminderRef.id} in database \'${adminDb.databaseId}\'. Matched Member ID: ${matchedMemberId}, Name: ${memberName}.`);
      return { success: true, message: "Your request for a Registration ID reminder has been submitted. An administrator will review it and contact you shortly.", reminderId: newReminderRef.id };
    } else {
      // This case should ideally be caught by the specific identifierType checks above.
      // If it reaches here, it's an unexpected state.
      console.error(`Server Action (submitRegistrationIdReminder): Member not found for ${identifierType} \'${trimmedIdentifier}\', but no specific message was returned. This indicates a logic flaw.`);
      return { success: false, message: `Could not find a matching record for the provided ${identifierType}.` };
    }

  } catch (error: any) {
    console.error(
      `Server Action (submitRegistrationIdReminder): CRITICAL ERROR submitting reminder request for \'${identifierType}: ${trimmedIdentifier}\' in database \'${adminDb?.databaseId || 'UNKNOWN_DB'}\'. This might be a Firestore query issue (e.g., missing index for userPhoneNumber or userEmail) or a general Firestore/Admin SDK error.`,
      "\\n  Error Message:", (error as Error).message,
      "\\n  Error Code:", (error as any).code,
      "\\n  Full Error Object:", error,
      "\\n  Stack Trace:", (error as Error).stack
    );
    if ((error as any).code === 'FAILED_PRECONDITION') {
        return { success: false, message: `Server Action Error: Failed to submit reminder request due to a database configuration issue (likely missing index for ${identifierType}). Please contact support. CRITICAL: Check server logs.` };
    }
    return { success: false, message: `Server Action Error: Failed to submit reminder request. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function getPendingRegistrationIdReminders(): Promise<{ success: boolean; reminders?: (RegistrationIdReminderRequest & { reminderId: string })[]; message?: string }> {
  if (!adminDb) {
    console.error(`Server Action (getPendingRegistrationIdReminders): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (getPendingRegistrationIdReminders): Fetching from '${REGISTRATION_ID_REMINDERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);
  try {
    const snapshot = await adminDb.collection(REGISTRATION_ID_REMINDERS_COLLECTION_NAME)
      .where("status", "==", "pending")
      .orderBy("requestDate", "asc")
      .get();
    const reminders: (RegistrationIdReminderRequest & { reminderId: string })[] = [];
    snapshot.forEach(doc => {
      try {
        const data = doc.data();
        reminders.push(mapTimestampsToDatesInObject({ ...data, reminderId: doc.id }, ['requestDate']) as RegistrationIdReminderRequest & { reminderId: string });
      } catch (mapError: any) {
        console.error(`Server Action (getPendingRegistrationIdReminders): Error mapping document ${doc.id} from '${REGISTRATION_ID_REMINDERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Error: ${mapError.message}. Data:`, doc.data(), "Stack:", mapError.stack);
      }
    });
    console.log(`Server Action (getPendingRegistrationIdReminders): Returning ${reminders.length} pending reminders from database '${adminDb.databaseId}'.`);
    return { success: true, reminders };
  } catch (error: any) {
    console.error(
      `Server Action (getPendingRegistrationIdReminders): CRITICAL ERROR fetching pending Reg ID reminders from database '${adminDb?.databaseId || 'UNKNOWN_DB'}'. Error: ${(error as Error).message}. Check Firestore indexes if it's a FAILED_PRECONDITION.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: "Server Action Error: Failed to fetch Reg ID reminders. CRITICAL: Check server logs." };
  }
}

export async function resolveRegistrationIdReminder(reminderId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error(`Server Action (resolveRegistrationIdReminder): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (resolveRegistrationIdReminder): Resolving '${reminderId}' in '${REGISTRATION_ID_REMINDERS_COLLECTION_NAME}' in database '${adminDb.databaseId}'`);
  try {
    await adminDb.collection(REGISTRATION_ID_REMINDERS_COLLECTION_NAME).doc(reminderId).update({ status: 'resolved' });
    console.log(`Server Action (resolveRegistrationIdReminder): Reminder ${reminderId} status updated to 'resolved' in database '${adminDb.databaseId}'.`);
    return { success: true, message: "Reminder marked as resolved." };
  } catch (error: any) {
    console.error(
      `Server Action (resolveRegistrationIdReminder): CRITICAL ERROR resolving reminder '${reminderId}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\n  Error Message:", (error as Error).message,
      "\n  Error Code:", (error as any).code,
      "\n  Full Error Object:", error,
      "\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to resolve reminder. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}

export async function updateMemberAccountStatus(
  memberId: string,
  newStatus: AccountStatus
): Promise<{ success: boolean; message: string; member?: StoredMember }> {
  if (!adminDb) {
    console.error(`Server Action (updateMemberAccountStatus): ${getCriticalDbErrorMessage()}`);
    return { success: false, message: getCriticalDbErrorMessage() };
  }
  console.log(`Server Action (updateMemberAccountStatus): Updating status for member ID: ${memberId} to '${newStatus}' in database '${adminDb.databaseId}'`);

  if (!memberId || typeof memberId !== 'string' || memberId.trim() === '') {
    console.warn("Server Action (updateMemberAccountStatus): Invalid memberId received:", memberId);
    return { success: false, message: "Invalid Member ID." };
  }

  const validStatuses: AccountStatus[] = ['pending_initial_payment', 'active', 'inactive_payment_rejected', 'membership_expired', 'paused'];
  if (!validStatuses.includes(newStatus)) {
    console.warn(`Server Action (updateMemberAccountStatus): Invalid newStatus received: ${newStatus}`);
    return { success: false, message: "Invalid account status provided." };
  }

  try {
    const memberDocRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(memberId.trim());
    const memberSnap = await memberDocRef.get();

    if (!memberSnap.exists) {
      return { success: false, message: `Member with ID ${memberId} not found in database '${adminDb.databaseId}'.` };
    }

    await memberDocRef.update({ accountStatus: newStatus });
    console.log(`Server Action (updateMemberAccountStatus): Member ${memberId} status updated to ${newStatus} in database '${adminDb.databaseId}'.`);

    const updatedMemberResult = await getMemberByIdFromDb(memberId.trim());
    if (!updatedMemberResult.success || !updatedMemberResult.member) {
      console.warn(`Server Action (updateMemberAccountStatus): Member ${memberId} updated but failed to re-fetch. Returning success without member data.`);
      return { success: true, message: "Member status updated successfully, but could not re-fetch member details." };
    }

    return { success: true, message: "Member account status updated successfully.", member: updatedMemberResult.member };
  } catch (error: any) {
    console.error(
      `Server Action (updateMemberAccountStatus): CRITICAL ERROR updating status for '${memberId}' in Firestore collection '${MEMBERS_COLLECTION_NAME}' in database '${adminDb?.databaseId || 'UNKNOWN_DB'}'.`,
      "\\n  Error Message:", (error as Error).message,
      "\\n  Error Code:", (error as any).code,
      "\\n  Full Error Object:", error,
      "\\n  Stack Trace:", (error as Error).stack
    );
    return { success: false, message: `Server Action Error: Failed to update member status. CRITICAL: Check server logs. Error: ${(error as Error).message}` };
  }
}
    
