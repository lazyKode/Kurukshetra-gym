// On-device implementation of src/actions/forum-actions.ts.
// The GitHub Pages build swaps this in for the server actions (see next.config.mjs).

import { deleteDoc, errorMessage, getDoc, listDocs, newId, setDoc, updateDoc } from "./store";

const QUESTIONS = "forumQuestions";
const REPLIES = "forumReplies";
const USERS = "users";
const MEMBERS = "kkrdb";

const iso = (value: any) => (value instanceof Date ? value.toISOString() : value);
const time = (value: any) => new Date(value).getTime() || 0;

async function ensureAdmin(adminUserId: string): Promise<void> {
  const user = await getDoc(USERS, adminUserId);
  if (!user?.isAdmin) {
    throw new Error("User does not have admin privileges.");
  }
}

async function findUser(userId: string) {
  const user = await getDoc(USERS, userId);
  if (user) return { collection: USERS, data: user };
  const member = await getDoc(MEMBERS, userId);
  if (member) return { collection: MEMBERS, data: member };
  return undefined;
}

export async function getForumUserDetails(userId: string): Promise<{
  success: boolean;
  user?: { userId: string; userName: string; registrationId?: string; isAdmin: boolean; isForumBlocked: boolean };
  message?: string;
}> {
  if (!userId) {
    return { success: false, message: "User ID not provided." };
  }
  try {
    const found = await findUser(userId);
    if (!found) {
      return { success: false, message: "User not found." };
    }
    const { collection, data } = found;
    const isMember = collection === MEMBERS;
    return {
      success: true,
      user: {
        userId,
        userName: isMember
          ? data.userName || `Member ${userId}`
          : data.userName || data.name || data.displayName || `User ${userId}`,
        registrationId: isMember ? userId : data.registrationId,
        isAdmin: data.isAdmin === true,
        isForumBlocked: data.isForumBlocked === true,
      },
    };
  } catch (error) {
    return { success: false, message: `Error fetching user details: ${errorMessage(error)}` };
  }
}

export async function deleteForumQuestion(
  questionId: string,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    await ensureAdmin(adminUserId);
    for (const reply of await listDocs(REPLIES)) {
      if (reply.data.questionId === questionId) {
        await deleteDoc(REPLIES, reply.id);
      }
    }
    await deleteDoc(QUESTIONS, questionId);
    return { success: true, message: "Question and replies deleted successfully." };
  } catch (error) {
    return { success: false, message: `Error deleting question: ${errorMessage(error)}` };
  }
}

export async function deleteForumReply(
  questionId: string,
  replyId: string,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    await ensureAdmin(adminUserId);
    await deleteDoc(REPLIES, replyId);
    return { success: true, message: "Reply deleted successfully." };
  } catch (error) {
    return { success: false, message: `Error deleting reply: ${errorMessage(error)}` };
  }
}

async function setForumBlocked(targetUserId: string, adminUserId: string, blocked: boolean) {
  const verb = blocked ? "blocked from" : "unblocked from";
  try {
    await ensureAdmin(adminUserId);
    const found = await findUser(targetUserId);
    if (!found) {
      return { success: false, message: `User/Member ${targetUserId} not found.` };
    }
    await updateDoc(found.collection, targetUserId, { isForumBlocked: blocked });
    const label = found.collection === MEMBERS ? "Member" : "User";
    return { success: true, message: `${label} ${targetUserId} has been ${verb} the forum.` };
  } catch (error) {
    return { success: false, message: `Error ${blocked ? "blocking" : "unblocking"} user: ${errorMessage(error)}` };
  }
}

export async function blockForumUser(
  targetUserId: string,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  return setForumBlocked(targetUserId, adminUserId, true);
}

export async function unblockForumUser(
  targetUserId: string,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  return setForumBlocked(targetUserId, adminUserId, false);
}

async function checkCanPost(authorId: string, kind: "question" | "reply") {
  const details = await getForumUserDetails(authorId);
  if (!details.success) {
    return `User not found. Cannot post ${kind}.`;
  }
  if (details.user?.isForumBlocked) {
    return "You are currently blocked from posting in the forum.";
  }
  return undefined;
}

export async function postNewQuestion(
  authorId: string,
  authorName: string,
  title: string,
  content: string
): Promise<{ success: boolean; message: string; questionId?: string }> {
  if (!authorId) {
    return { success: false, message: "Author ID is required to post a question." };
  }
  if (!title || !content) {
    return { success: false, message: "Title and content are required." };
  }
  try {
    const problem = await checkCanPost(authorId, "question");
    if (problem) {
      return { success: false, message: problem };
    }
    const questionId = newId();
    const now = new Date();
    await setDoc(QUESTIONS, questionId, {
      title,
      content,
      authorId,
      authorName,
      createdAt: now,
      replyCount: 0,
      lastActivityAt: now,
    });
    return { success: true, message: "Question posted successfully.", questionId };
  } catch (error) {
    return { success: false, message: `Error posting question: ${errorMessage(error)}` };
  }
}

export async function postNewReply(
  questionId: string,
  authorId: string,
  authorName: string,
  replyContent: string
): Promise<{ success: boolean; message: string; replyId?: string }> {
  if (!authorId) {
    return { success: false, message: "Author ID is required to post a reply." };
  }
  if (!questionId) {
    return { success: false, message: "Question ID is required to post a reply." };
  }
  if (!replyContent) {
    return { success: false, message: "Reply content is required." };
  }
  try {
    const problem = await checkCanPost(authorId, "reply");
    if (problem) {
      return { success: false, message: problem };
    }
    const question = await getDoc(QUESTIONS, questionId);
    if (!question) {
      return { success: false, message: "Question not found. It may have been deleted." };
    }
    const replyId = newId();
    const now = new Date();
    await setDoc(REPLIES, replyId, { questionId, authorId, authorName, content: replyContent, createdAt: now });
    await updateDoc(QUESTIONS, questionId, { replyCount: (question.replyCount || 0) + 1, lastActivityAt: now });
    return { success: true, message: "Reply posted successfully.", replyId };
  } catch (error) {
    return { success: false, message: `Error posting reply: ${errorMessage(error)}` };
  }
}

export async function getForumQuestions(
  limitCount: number = 20
): Promise<{ success: boolean; questions?: any[]; message: string }> {
  try {
    const questionDocs = (await listDocs(QUESTIONS))
      .sort((a, b) => time(b.data.lastActivityAt) - time(a.data.lastActivityAt))
      .slice(0, limitCount);
    if (questionDocs.length === 0) {
      return { success: true, questions: [], message: "No forum questions found." };
    }
    const replyDocs = await listDocs(REPLIES);
    const questions = questionDocs.map((doc) => ({
      id: doc.id,
      ...doc.data,
      createdAt: iso(doc.data.createdAt),
      lastActivityAt: iso(doc.data.lastActivityAt),
      userName: doc.data.authorName,
      replies: replyDocs
        .filter((reply) => reply.data.questionId === doc.id)
        .sort((a, b) => time(a.data.createdAt) - time(b.data.createdAt))
        .map((reply) => ({
          id: reply.id,
          ...reply.data,
          userName: reply.data.authorName,
          createdAt: iso(reply.data.createdAt),
        })),
    }));
    return { success: true, questions, message: "Questions and their replies retrieved successfully." };
  } catch (error) {
    return { success: false, message: `Error retrieving questions: ${errorMessage(error)}` };
  }
}
