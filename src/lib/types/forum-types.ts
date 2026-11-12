
export interface ForumReply {
  id: string;
  questionId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: Date;
}

export interface ForumQuestion {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  title: string;
  content: string;
  createdAt: Date;
  replies?: ForumReply[];
  lastReplyAt?: Date; 
}

// For submitting new questions/replies, you might not have the id or createdAt yet
export interface NewForumQuestionData {
  userId: string;
  userName: string; // Or fetch on server based on userId
  userAvatar?: string; // Or fetch on server
  title: string;
  content: string;
}

export interface NewForumReplyData {
  questionId: string;
  userId: string;
  userName: string; // Or fetch on server
  userAvatar?: string; // Or fetch on server
  content: string;
}
