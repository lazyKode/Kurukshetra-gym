
"use server";

import { Timestamp, FieldValue, type QueryDocumentSnapshot, type DocumentData } from 'firebase-admin/firestore';
import { adminDb } from '../lib/firebase-admin'; // Ensured adminDb is imported

const FORUM_QUESTIONS_COLLECTION = process.env.FORUM_QUESTIONS_COLLECTION || "forumQuestions";
const FORUM_REPLIES_COLLECTION_SUFFIX = process.env.FORUM_REPLIES_COLLECTION_SUFFIX || "_replies";
const USERS_COLLECTION = process.env.USERS_COLLECTION || 'users'; // For admins or general forum users
const MEMBERS_COLLECTION_NAME = process.env.MEMBERS_COLLECTION_NAME || "kkrdb"; // For gym members

async function ensureAdmin(adminUserId: string): Promise<void> {
  console.log(`[ensureAdmin] Verifying admin status for user: ${adminUserId}`);
  if (!adminDb) {
    console.error("[ensureAdmin] Admin DB not available for admin check.");
    throw new Error("Admin DB not available for admin check.");
  }
  const userDoc = await adminDb.collection(USERS_COLLECTION).doc(adminUserId).get();
  if (!userDoc.exists || !userDoc.data()?.isAdmin) {
    console.warn(`[ensureAdmin] Admin check failed for user: ${adminUserId}. User does not exist or is not admin.`);
    throw new Error("User does not have admin privileges.");
  }
  console.log(`[ensureAdmin] Admin status verified for user: ${adminUserId}`);
}

export async function getForumUserDetails(userId: string): Promise<{ success: boolean; user?: { userId: string; userName: string; registrationId?: string; isAdmin: boolean; isForumBlocked: boolean }; message?: string }> {
  if (!adminDb) {
    console.error("[ForumAction] getForumUserDetails: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  if (!userId) {
    console.warn("[ForumAction] getForumUserDetails: userId was not provided.");
    return { success: false, message: "User ID not provided." };
  }
  try {
    // Attempt 1: Check USERS_COLLECTION (for admins/general forum users)
    let userDoc = await adminDb.collection(USERS_COLLECTION).doc(userId).get();
    let userData = userDoc.data();
    let sourceCollection = USERS_COLLECTION;

    if (!userDoc.exists) {
      // Attempt 2: Check MEMBERS_COLLECTION_NAME (for gym members)
      console.log(`[ForumAction] getForumUserDetails: User ${userId} not found in '${USERS_COLLECTION}'. Trying '${MEMBERS_COLLECTION_NAME}'...`);
      userDoc = await adminDb.collection(MEMBERS_COLLECTION_NAME).doc(userId).get();
      userData = userDoc.data();
      sourceCollection = MEMBERS_COLLECTION_NAME;
    }

    if (!userDoc.exists) {
      console.log(`[ForumAction] getForumUserDetails: User ${userId} not found in both '${USERS_COLLECTION}' and '${MEMBERS_COLLECTION_NAME}'.`);
      return { success: false, message: "User not found." };
    }

    if (!userData) {
        console.error(`[ForumAction] getForumUserDetails: User data is missing for user ${userId} in collection '${sourceCollection}'.`);
        return { success: false, message: "User data not found." };
    }

    let userName: string;
    let isAdmin: boolean;
    let isForumBlocked: boolean;
    let registrationId: string | undefined;

    if (sourceCollection === USERS_COLLECTION) {
      userName = userData.userName || userData.name || userData.displayName || `User ${userId}`;
      isAdmin = userData.isAdmin === true;
      isForumBlocked = userData.isForumBlocked === true;
      registrationId = userData.registrationId; // if admins have a separate registrationId field
    } else { // Source is MEMBERS_COLLECTION_NAME
      userName = userData.userName || `Member ${userId}`; // Members use userName
      isAdmin = userData.isAdmin === true; // Members are typically not admins unless specified
      isForumBlocked = userData.isForumBlocked === true; // Check if members can be forum blocked
      registrationId = userId; // For members, their main ID is their registrationId
    }

    console.log(`[ForumAction] getForumUserDetails: Fetched details for user ${userId} from '${sourceCollection}' - isAdmin: ${isAdmin}, isForumBlocked: ${isForumBlocked}`);
    return {
      success: true,
      user: {
        userId: userId,
        userName: userName,
        registrationId: registrationId,
        isAdmin: isAdmin,
        isForumBlocked: isForumBlocked
      }
    };
  } catch (error) {
    console.error(`[ForumAction] Error fetching user details for ${userId}:`, error);
    return { success: false, message: `Error fetching user details: ${(error as Error).message}` };
  }
}

// --- Admin Actions ---

export async function deleteForumQuestion(questionId: string, adminUserId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error("[AdminAction] deleteForumQuestion: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  try {
    await ensureAdmin(adminUserId);
    const questionRef = adminDb.collection(FORUM_QUESTIONS_COLLECTION).doc(questionId);
    const repliesCollectionName = questionId + FORUM_REPLIES_COLLECTION_SUFFIX;
    const repliesCollectionRef = questionRef.collection(repliesCollectionName);
    const repliesSnapshot = await repliesCollectionRef.limit(500).get();
    if (repliesSnapshot.size > 0) {
        const batch = adminDb.batch();
        repliesSnapshot.docs.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        if (repliesSnapshot.size === 500) {
            console.warn(`[AdminAction] deleteForumQuestion: More than 500 replies might exist for ${questionId}. Consider a more robust deletion strategy.`);
        }
    }
    await questionRef.delete();
    console.log(`[AdminAction] Question ${questionId} and its replies deleted by admin ${adminUserId}.`);
    return { success: true, message: "Question and replies deleted successfully." };
  } catch (error) {
    console.error("[AdminAction] Error deleting forum question:", error);
    return { success: false, message: `Error deleting question: ${(error as Error).message}` };
  }
}

export async function deleteForumReply(questionId: string, replyId: string, adminUserId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error("[AdminAction] deleteForumReply: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  try {
    await ensureAdmin(adminUserId);
    const repliesCollectionName = questionId + FORUM_REPLIES_COLLECTION_SUFFIX;
    const replyRef = adminDb
      .collection(FORUM_QUESTIONS_COLLECTION)
      .doc(questionId)
      .collection(repliesCollectionName)
      .doc(replyId);
    await replyRef.delete();
    console.log(`[AdminAction] Reply ${replyId} in question ${questionId} deleted by admin ${adminUserId}.`);
    return { success: true, message: "Reply deleted successfully." };
  } catch (error) {
    console.error("[AdminAction] Error deleting forum reply:", error);
    return { success: false, message: `Error deleting reply: ${(error as Error).message}` };
  }
}

export async function blockForumUser(targetUserId: string, adminUserId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error("[AdminAction] blockForumUser: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  try {
    await ensureAdmin(adminUserId);
    // This action should primarily target the USERS_COLLECTION if that's where general forum user profiles are.
    // If members from 'kkrdb' can also be blocked, this might need adjustment or a separate function.
    const userRef = adminDb.collection(USERS_COLLECTION).doc(targetUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        // Optionally, check MEMBERS_COLLECTION_NAME if targetUserId could be a member ID
        const memberRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(targetUserId);
        const memberDoc = await memberRef.get();
        if (!memberDoc.exists) {
            console.error(`[AdminAction] blockForumUser: User/Member ${targetUserId} not found in '${USERS_COLLECTION}' or '${MEMBERS_COLLECTION_NAME}'.`);
            return { success: false, message: `User/Member ${targetUserId} not found.` };
        }
        await memberRef.update({ isForumBlocked: true });
        console.log(`[AdminAction] Member ${targetUserId} (from ${MEMBERS_COLLECTION_NAME}) blocked from forum by admin ${adminUserId}.`);
        return { success: true, message: `Member ${targetUserId} has been blocked from the forum.` };
    }
    await userRef.update({ isForumBlocked: true });
    console.log(`[AdminAction] User ${targetUserId} (from ${USERS_COLLECTION}) blocked from forum by admin ${adminUserId}.`);
    return { success: true, message: `User ${targetUserId} has been blocked from the forum.` };
  } catch (error) {
    console.error(`[AdminAction] Error blocking user ${targetUserId}:`, error);
    return { success: false, message: `Error blocking user: ${(error as Error).message}` };
  }
}

export async function unblockForumUser(targetUserId: string, adminUserId: string): Promise<{ success: boolean; message: string }> {
  if (!adminDb) {
    console.error("[AdminAction] unblockForumUser: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  try {
    await ensureAdmin(adminUserId);
    const userRef = adminDb.collection(USERS_COLLECTION).doc(targetUserId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        const memberRef = adminDb.collection(MEMBERS_COLLECTION_NAME).doc(targetUserId);
        const memberDoc = await memberRef.get();
        if (!memberDoc.exists) {
            console.error(`[AdminAction] unblockForumUser: User/Member ${targetUserId} not found.`);
            return { success: false, message: `User/Member ${targetUserId} not found.` };
        }
        await memberRef.update({ isForumBlocked: false });
        console.log(`[AdminAction] Member ${targetUserId} (from ${MEMBERS_COLLECTION_NAME}) unblocked from forum by admin ${adminUserId}.`);
        return { success: true, message: `Member ${targetUserId} has been unblocked from the forum.` };
    }
    await userRef.update({ isForumBlocked: false });
    console.log(`[AdminAction] User ${targetUserId} (from ${USERS_COLLECTION}) unblocked from forum by admin ${adminUserId}.`);
    return { success: true, message: `User ${targetUserId} has been unblocked from the forum.` };
  } catch (error) {
    console.error(`[AdminAction] Error unblocking user ${targetUserId}:`, error);
    return { success: false, message: `Error unblocking user: ${(error as Error).message}` };
  }
}

// --- User-Facing Actions ---

export async function postNewQuestion(
  authorId: string,
  authorName: string,
  title: string,
  content: string
): Promise<{ success: boolean; message: string; questionId?: string }> {
  if (!adminDb) {
    console.error("[ForumAction] postNewQuestion: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  if (!authorId) {
    console.error("[ForumAction] postNewQuestion: authorId is required.");
    return { success: false, message: "Author ID is required to post a question." };
  }
  if (!title || !content) {
    console.error("[ForumAction] postNewQuestion: title and content are required.");
    return { success: false, message: "Title and content are required." };
  }
  try {
    // Check if the user is blocked from the forum (checks both collections)
    const userDetailsResult = await getForumUserDetails(authorId);
    if (userDetailsResult.success && userDetailsResult.user?.isForumBlocked) {
      console.log(`[ForumAction] User ${authorId} is blocked from posting new questions.`);
      return { success: false, message: "You are currently blocked from posting in the forum." };
    }
    if (!userDetailsResult.success) { // User not found in either collection
        console.log(`[ForumAction] User ${authorId} not found, cannot post question.`);
        return { success: false, message: "User not found. Cannot post question." };
    }


    const newQuestionRef = adminDb.collection(FORUM_QUESTIONS_COLLECTION).doc();
    await newQuestionRef.set({
      title,
      content,
      authorId,
      authorName, // Use the name passed from client, which should be resolved by getForumUserDetails
      createdAt: Timestamp.now(),
      replyCount: 0,
      lastActivityAt: Timestamp.now(),
    });
    console.log(`[ForumAction] New question ${newQuestionRef.id} posted by user ${authorId}.`);
    return { success: true, message: "Question posted successfully.", questionId: newQuestionRef.id };
  } catch (error) {
    console.error(`[ForumAction] Error posting new question by user ${authorId}:`, error);
    return { success: false, message: `Error posting question: ${(error as Error).message}` };
  }
}

export async function postNewReply(
  questionId: string,
  authorId: string,
  authorName: string,
  replyContent: string
): Promise<{ success: boolean; message: string; replyId?: string }> {
  if (!adminDb) {
    console.error("[ForumAction] postNewReply: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  if (!authorId) {
    console.error("[ForumAction] postNewReply: authorId is required.");
    return { success: false, message: "Author ID is required to post a reply." };
  }
  if (!questionId) {
    console.error("[ForumAction] postNewReply: questionId is required.");
    return { success: false, message: "Question ID is required to post a reply." };
  }
  if (!replyContent) {
    console.error("[ForumAction] postNewReply: replyContent is required.");
    return { success: false, message: "Reply content is required." };
  }
  try {
    const userDetailsResult = await getForumUserDetails(authorId);
    if (userDetailsResult.success && userDetailsResult.user?.isForumBlocked) {
      console.log(`[ForumAction] User ${authorId} is blocked from posting new replies.`);
      return { success: false, message: "You are currently blocked from posting in the forum." };
    }
     if (!userDetailsResult.success) { // User not found in either collection
        console.log(`[ForumAction] User ${authorId} not found, cannot post reply.`);
        return { success: false, message: "User not found. Cannot post reply." };
    }

    const repliesCollectionName = questionId + FORUM_REPLIES_COLLECTION_SUFFIX;
    const newReplyRef = adminDb.collection(FORUM_QUESTIONS_COLLECTION).doc(questionId).collection(repliesCollectionName).doc();
    await newReplyRef.set({
      questionId,
      authorId,
      authorName, // Use the name passed from client
      content: replyContent,
      createdAt: Timestamp.now(),
    });

    const questionRef = adminDb.collection(FORUM_QUESTIONS_COLLECTION).doc(questionId);
    await questionRef.update({
        replyCount: FieldValue.increment(1),
        lastActivityAt: Timestamp.now()
    });
    console.log(`[ForumAction] New reply ${newReplyRef.id} posted by user ${authorId} to question ${questionId}.`);
    return { success: true, message: "Reply posted successfully.", replyId: newReplyRef.id };
  } catch (error) {
    console.error(`[ForumAction] Error posting new reply by user ${authorId} to question ${questionId}:`, error);
    return { success: false, message: `Error posting reply: ${(error as Error).message}` };
  }
}

export async function getForumQuestions(limitCount: number = 20): Promise<{ success: boolean; questions?: any[]; message: string }> {
  if (!adminDb) {
    console.error("[ForumAction] getForumQuestions: Admin database not initialized.");
    return { success: false, message: "Admin database not initialized." };
  }
  try {
    const questionsSnapshot = await adminDb.collection(FORUM_QUESTIONS_COLLECTION)
                                          .orderBy("lastActivityAt", "desc")
                                          .limit(limitCount)
                                          .get();
    if (questionsSnapshot.empty) {
      return { success: true, questions: [], message: "No forum questions found." };
    }

    const questions = await Promise.all(questionsSnapshot.docs.map(async (doc: QueryDocumentSnapshot<DocumentData>) => {
      const data = doc.data();
      const questionId = doc.id;
      const repliesCollectionName = questionId + FORUM_REPLIES_COLLECTION_SUFFIX;

      const repliesSnapshot = await adminDb.collection(FORUM_QUESTIONS_COLLECTION)
                                           .doc(questionId)
                                           .collection(repliesCollectionName)
                                           .orderBy("createdAt", "asc")
                                           .get();

      const replies = repliesSnapshot.docs.map((replyDoc: QueryDocumentSnapshot<DocumentData>) => {
        const replyData = replyDoc.data();
        return {
          id: replyDoc.id,
          ...replyData,
          userName: replyData.authorName, 
          createdAt: replyData.createdAt instanceof Timestamp ? replyData.createdAt.toDate().toISOString() : replyData.createdAt,
        };
      });

      return {
        id: questionId,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        lastActivityAt: data.lastActivityAt instanceof Timestamp ? data.lastActivityAt.toDate().toISOString() : data.lastActivityAt,
        replies: replies,
        userName: data.authorName, // Prefer authorName; client will use 'Anonymous' if this is undefined/null
      };
    }));

    return { success: true, questions, message: "Questions and their replies retrieved successfully." };
  } catch (error) {
    console.error("[ForumAction] Error retrieving forum questions:", error);
    return { success: false, message: `Error retrieving questions: ${(error as Error).message}` };
  }
}

