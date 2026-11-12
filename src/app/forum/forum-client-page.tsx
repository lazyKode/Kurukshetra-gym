
"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation"; 
import Link from "next/link";
import { MessageSquare, Send, Loader2, AlertCircle, ArrowLeft, LogOut, User, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { ForumQuestion, ForumReply } from "@/lib/types/forum-types";
import { RegistrationIdLoginDialog } from "@/components/forum/registration-id-login-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
    getForumQuestions, 
    postNewQuestion, 
    postNewReply, 
    getForumUserDetails, 
    deleteForumQuestion,
    deleteForumReply
} from "@/actions/forum-actions";

const FORUM_REG_ID_STORAGE_KEY = "forumLoggedInRegistrationId";
const MAIN_MEMBER_ID_KEY = "loggedInMemberId"; // User's main app login ID
const FORUM_USER_DISPLAY_NAME_KEY = 'forumUserDisplayName';
const IS_ADMIN_USER_KEY = 'isAdminUser';


export default function ForumClientPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); 
  const { toast } = useToast();
  const [questions, setQuestions] = React.useState<ForumQuestion[]>([]);
  const [newQuestionContent, setNewQuestionContent] = React.useState("");
  const [newQuestionTitle, setNewQuestionTitle] = React.useState("");
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [newReplyContent, setNewReplyContent] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [hasMounted, setHasMounted] = React.useState(false);

  const [showRegIdLoginDialog, setShowRegIdLoginDialog] = React.useState(false);
  const [loggedInRegistrationId, setLoggedInRegistrationId] = React.useState<string | null>(null); // This is the ID used for forum posting
  const [currentUserName, setCurrentUserName] = React.useState<string | null>(null); // Display name for the forum session user
  const [isForumUserLoggedIn, setIsForumUserLoggedIn] = React.useState(false); // Is someone logged in specifically for FORUM posting
  const [activeMainMemberId, setActiveMainMemberId] = React.useState<string | null>(null); // Main app session ID (e.g., admin001 or member's ID)
  const [isAdminUser, setIsAdminUser] = React.useState(false); // Is the MAIN_MEMBER_ID_KEY an admin?
  const [navigatedFromAdminDashboard, setNavigatedFromAdminDashboard] = React.useState(false);


  const fetchQuestions = React.useCallback(async () => {
    setIsLoadingQuestions(true);
    setFetchError(null);
    try {
      const result = await getForumQuestions();
      if (result.success && result.questions) {
        setQuestions(result.questions as ForumQuestion[]);
      } else {
        setFetchError(result.message || "Failed to load questions.");
        setQuestions([]);
      }
    } catch (error) {
      console.error("Error fetching forum questions:", error);
      setFetchError("An unexpected error occurred while fetching questions.");
      setQuestions([]);
    } finally {
      setIsLoadingQuestions(false);
    }
  }, []);
  
  const handleRegIdLoginSuccess = React.useCallback(async (regId: string, nameFromVerification?: string) => {
    let displayNameToSet = nameFromVerification || `User ${regId}`;
    let isAdminForForumSession = false; // Is the *forum posting identity* an admin
    
    const userDetailsResult = await getForumUserDetails(regId);
    if (userDetailsResult.success && userDetailsResult.user) {
        displayNameToSet = userDetailsResult.user.userName; 
        isAdminForForumSession = userDetailsResult.user.isAdmin;
        if (userDetailsResult.user.isForumBlocked) {
          toast({ variant: "destructive", title: "Forum Access Denied", description: "This account is blocked from posting in the forum."});
          // Clear only forum-specific localStorage if they were trying to log in with a blocked ID
          // but retain main app session if different.
          if (localStorage.getItem(FORUM_REG_ID_STORAGE_KEY) === regId) {
            localStorage.removeItem(FORUM_REG_ID_STORAGE_KEY);
            localStorage.removeItem(FORUM_USER_DISPLAY_NAME_KEY);
            localStorage.removeItem(IS_ADMIN_USER_KEY); // This key reflects the *forum posting identity's* admin status
          }
          setIsForumUserLoggedIn(false); 
          if (loggedInRegistrationId === regId) setLoggedInRegistrationId(null); // If current attempt was for this ID
          return; 
        }
        // Store the admin status *of the forum posting ID*
        localStorage.setItem(IS_ADMIN_USER_KEY, isAdminForForumSession.toString());
    } else {
        // If fetching details failed, check if we have stored admin status for this exact regId
        const storedAdminStatusForThisRegId = (localStorage.getItem(FORUM_REG_ID_STORAGE_KEY) === regId) 
                                              ? localStorage.getItem(IS_ADMIN_USER_KEY) : null;
        if (storedAdminStatusForThisRegId) {
            isAdminForForumSession = storedAdminStatusForThisRegId === 'true';
        }
    }

    setLoggedInRegistrationId(regId); // The ID used for posting
    setCurrentUserName(displayNameToSet); // Display name for forum user
    setIsAdminUser(isAdminForForumSession); // Reflects if the *forum posting identity* is admin
    setIsForumUserLoggedIn(true); // Forum posting is enabled

    localStorage.setItem(FORUM_REG_ID_STORAGE_KEY, regId);
    localStorage.setItem(FORUM_USER_DISPLAY_NAME_KEY, displayNameToSet);
    
    setShowRegIdLoginDialog(false);
  }, [toast, loggedInRegistrationId]);


  React.useEffect(() => {
    setHasMounted(true);
    const mainMemberIdFromStorage = localStorage.getItem(MAIN_MEMBER_ID_KEY);
    const storedForumRegId = localStorage.getItem(FORUM_REG_ID_STORAGE_KEY);
    const storedForumUserName = localStorage.getItem(FORUM_USER_DISPLAY_NAME_KEY);

    const memberIdFromQuery = searchParams?.get('member_id');
    const fromAdminParam = searchParams?.get('from');
    let needsUrlClean = false;

    const initializeSession = async () => {
      // Set main application user context first (for display, even if not forum-logged-in)
      if (mainMemberIdFromStorage) {
        setActiveMainMemberId(mainMemberIdFromStorage);
        const tempUserDetails = await getForumUserDetails(mainMemberIdFromStorage);
        if (tempUserDetails.success && tempUserDetails.user) {
          // If the main user IS currentUserName, set it, otherwise forum login will set it.
           if(!isForumUserLoggedIn) setCurrentUserName(tempUserDetails.user.userName);
           setIsAdminUser(tempUserDetails.user.isAdmin); // This reflects if the *main app user* is admin
        }
      }

      if (memberIdFromQuery) {
        console.log("Forum: Attempting auto-login from member page for ID:", memberIdFromQuery);
        needsUrlClean = true;
        setNavigatedFromAdminDashboard(false);

        const userDetailsResult = await getForumUserDetails(memberIdFromQuery);
        if (userDetailsResult.success && userDetailsResult.user) {
          if (userDetailsResult.user.isForumBlocked) {
            toast({ variant: "destructive", title: "Forum Access Denied", description: "This account is blocked from posting in the forum." });
          } else {
            await handleRegIdLoginSuccess(memberIdFromQuery, userDetailsResult.user.userName);
            toast({ title: "Forum Session Active", description: `Logged in to forum as ${userDetailsResult.user.userName}. Posting enabled.` });
          }
        } else {
          toast({ variant: "destructive", title: "Forum Auto-Login Failed", description: userDetailsResult.message || "Could not verify your details for forum auto-login." });
        }
      } else if (fromAdminParam === 'admin_dashboard') {
        console.log("Forum: Detected navigation from admin dashboard.");
        needsUrlClean = true;
        setNavigatedFromAdminDashboard(true);
        if (mainMemberIdFromStorage && !storedForumRegId) { // Admin is primary user, no separate forum session yet
          console.log("Forum: Attempting admin auto-login for forum posting for ID:", mainMemberIdFromStorage);
          const adminUserDetails = await getForumUserDetails(mainMemberIdFromStorage);
          if (adminUserDetails.success && adminUserDetails.user) {
            if (adminUserDetails.user.isAdmin && !adminUserDetails.user.isForumBlocked) {
              await handleRegIdLoginSuccess(mainMemberIdFromStorage, adminUserDetails.user.userName);
              toast({ title: "Admin Forum Session Active", description: `Logged in for posting as admin: ${adminUserDetails.user.userName}. Posting enabled.` });
            } else if (adminUserDetails.user.isForumBlocked) {
              toast({ variant: "destructive", title: "Forum Access Denied", description: "This admin account is blocked from the forum." });
            } else {
              // Admin is not blocked, but not an admin according to userDetails (should not happen for admin001)
              // Or simply, admin is viewing, doesn't want to auto-post. Let them click login.
            }
          }
        } else if (storedForumRegId) { // Admin navigates, but there's an *existing* forum session. Restore it.
          console.log("Forum: Admin dashboard navigation, but existing forum session found for:", storedForumRegId, ". Restoring that.");
          await handleRegIdLoginSuccess(storedForumRegId, storedForumUserName || undefined);
        }
      } else if (storedForumRegId) { // Restore any generic previous forum session
        console.log("Forum: Restoring existing generic forum session for:", storedForumRegId);
        setNavigatedFromAdminDashboard(false);
        await handleRegIdLoginSuccess(storedForumRegId, storedForumUserName || undefined);
      }

      fetchQuestions();

      if (needsUrlClean) {
        Promise.resolve().then(() => {
          router.replace('/forum', undefined);
        });
      }
    };

    initializeSession();
  }, [router, searchParams, toast, fetchQuestions, handleRegIdLoginSuccess]);


  const handleForumUserLogout = () => {
    localStorage.removeItem(FORUM_REG_ID_STORAGE_KEY);
    localStorage.removeItem(FORUM_USER_DISPLAY_NAME_KEY);
    localStorage.removeItem(IS_ADMIN_USER_KEY); // Clear forum admin status
    
    setIsForumUserLoggedIn(false); 
    setLoggedInRegistrationId(null); 
    // Reset currentUserName and isAdminUser to reflect the main app session if available, or nullify
    if (activeMainMemberId) {
        getForumUserDetails(activeMainMemberId).then(details => {
            if(details.success && details.user){
                setCurrentUserName(details.user.userName);
                setIsAdminUser(details.user.isAdmin); // isAdminUser now reflects main app session admin status
            } else {
                setCurrentUserName(null);
                setIsAdminUser(false);
            }
        });
    } else {
        setCurrentUserName(null);
        setIsAdminUser(false);
    }
    
    toast({ title: "Forum Logout", description: "You have been logged out from forum posting." });

    // Redirection logic based on main app session
    if (activeMainMemberId && isAdminUser) { // if the MAIN user was an admin
        router.push("/admin/dashboard");
    } else if (activeMainMemberId) { // if the MAIN user was a regular member
        router.push(`/member/${activeMainMemberId}`);
    } else { // No main user session, go to general login/home
        router.push("/"); 
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!isForumUserLoggedIn || !isAdminUser || !loggedInRegistrationId) { // Check forum posting admin status
      toast({ variant: "destructive", title: "Error", description: "Admin privileges required for forum posting identity." });
      return;
    }
    setIsLoading(true);
    try {
      const result = await deleteForumQuestion(questionId, loggedInRegistrationId);
      if (result.success) {
        toast({ title: "Success", description: "Question deleted successfully." });
        fetchQuestions();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message || "Failed to delete question." });
      }
    } catch (error) {
      console.error("Error deleting question:", error);
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteReply = async (questionId: string, replyId: string) => {
    if (!isForumUserLoggedIn || !isAdminUser || !loggedInRegistrationId) { // Check forum posting admin status
      toast({ variant: "destructive", title: "Error", description: "Admin privileges required for forum posting identity." });
      return;
    }
    setIsLoading(true);
    try {
      const result = await deleteForumReply(questionId, replyId, loggedInRegistrationId);
      if (result.success) {
        toast({ title: "Success", description: "Reply deleted successfully." });
        fetchQuestions(); 
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message || "Failed to delete reply." });
      }
    } catch (error) {
      console.error("Error deleting reply:", error);
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!newQuestionTitle.trim() || !newQuestionContent.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Title and question content cannot be empty." });
      return;
    }
    if (!isForumUserLoggedIn || !loggedInRegistrationId || !currentUserName) {
      toast({ variant: "destructive", title: "Login Required", description: "Please login to ask a question." });
      setShowRegIdLoginDialog(true);
      return;
    }
    setIsLoading(true);
    try {
      const result = await postNewQuestion(loggedInRegistrationId, currentUserName, newQuestionTitle, newQuestionContent);
      if (result.success && result.questionId) {
        toast({ title: "Success", description: "Your question has been posted!" });
        setNewQuestionTitle("");
        setNewQuestionContent("");
        fetchQuestions();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message || "Failed to post question." });
      }
    } catch (error) {
      console.error("Error submitting question:", error);
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostReply = async (questionId: string) => {
    if (!newReplyContent.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Reply cannot be empty." });
      return;
    }
     if (!isForumUserLoggedIn || !loggedInRegistrationId || !currentUserName) {
      toast({ variant: "destructive", title: "Login Required", description: "Please login to reply." });
      setShowRegIdLoginDialog(true);
      return;
    }
    setIsLoading(true);
    try {
      const result = await postNewReply(questionId, loggedInRegistrationId, currentUserName, newReplyContent);
      if (result.success && result.replyId) {
        toast({ title: "Success", description: "Your reply has been posted!" });
        setNewReplyContent("");
        setReplyingTo(null);
        fetchQuestions();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message || "Failed to post reply." });
      }
    } catch (error: any) {
      console.error("Error posting reply:", error.message, error);
      toast({ variant: "destructive", title: "Error", description: `An unexpected error occurred while posting reply: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplyButtonClick = (questionId: string) => {
    if (!isForumUserLoggedIn) {
      setShowRegIdLoginDialog(true);
      toast({ title: "Login Required", description: "Please login to reply."});
    } else {
      setReplyingTo(questionId);
      setNewReplyContent('');
    }
  };

  const padToTwo = (num: number) => num.toString().padStart(2, '0');

  const formatDate = (dateInput: Date | string | undefined): string => {
    if (!dateInput) return "";
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (typeof window === 'undefined' || !hasMounted) { 
      const year = date.getUTCFullYear();
      const month = padToTwo(date.getUTCMonth() + 1); 
      const day = padToTwo(date.getUTCDate());
      return `${year}-${month}-${day}`; 
    }
    return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (dateInput: Date | string | undefined): string => {
    if (!dateInput) return "";
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
     if (typeof window === 'undefined' || !hasMounted) {
      const hours = padToTwo(date.getUTCHours());
      const minutes = padToTwo(date.getUTCMinutes());
      return `${hours}:${minutes}`; 
    }
    return new Date(date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };


  if (!hasMounted) { 
    return (
        <div className="flex justify-center items-center min-h-screen">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-muted/40">
      <main className="flex-grow py-8 px-4 md:px-8">
        <RegistrationIdLoginDialog
          open={showRegIdLoginDialog}
          onOpenChange={setShowRegIdLoginDialog}
          onSuccess={(regId) => {
            // This is when user explicitly logs in via dialog
            handleRegIdLoginSuccess(regId); 
            // Toast is handled by handleRegIdLoginSuccess if successful, or form shows error
          }}
        />
        <div className="max-w-3xl mx-auto">
          <Card className="mb-8 shadow-lg">
            <CardHeader>
              <div className="flex justify-end mb-4">
                {isForumUserLoggedIn && ( // Only show forum logout if forum session is active
                  <Button variant="outline" onClick={handleForumUserLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout Forum Session
                  </Button>
                )}
              </div>
              <div className="flex justify-between items-center">
                  <CardTitle className="text-3xl font-bold text-primary flex items-center">
                  <MessageSquare className="mr-3 h-8 w-8" /> Community Forum
                  </CardTitle>
                  {/* Dropdown shows main app user context, or forum user context if different */}
                  {(currentUserName || loggedInRegistrationId || activeMainMemberId) && (
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="group p-0 flex items-center justify-center !w-20 !h-20 hover:bg-black focus-visible:ring-0 focus-visible:ring-offset-0">
                                  <User size={80} className="text-primary group-hover:text-white" />
                              </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                              <DropdownMenuLabel>
                                {currentUserName ? `Hi, ${currentUserName}!` : (loggedInRegistrationId ? `Forum ID: ${loggedInRegistrationId}` : (activeMainMemberId ? "Viewing as Guest" : "Not Logged In"))}
                                {isForumUserLoggedIn && isAdminUser && <span className="text-xs text-primary ml-1">(Admin Forum Privileges)</span>}
                                {!isForumUserLoggedIn && activeMainMemberId && isAdminUser && <span className="text-xs text-primary ml-1">(Admin Main Session)</span>}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {activeMainMemberId ? (
                                  <DropdownMenuItem asChild>
                                      <Link href={`/member/${activeMainMemberId}`} passHref>
                                         View My Member Profile
                                      </Link>
                                  </DropdownMenuItem>
                              ): null }
                              {!isForumUserLoggedIn && (activeMainMemberId || !loggedInRegistrationId) && ( // Show if not forum logged in, regardless of main session
                                <DropdownMenuItem onClick={() => setShowRegIdLoginDialog(true)}>
                                  Login to Forum to Post
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuContent>
                      </DropdownMenu>
                  )}
              </div>
              <CardDescription>
                Ask questions, share advice, and connect with other members.
                {navigatedFromAdminDashboard && currentUserName && isAdminUser && isForumUserLoggedIn && <span className="block text-sm text-primary">Admin auto-logged in from dashboard. Posting enabled.</span>}
                {/* Removed: Logged in as {currentUserName} (Main App). Login to forum to post. */}
                {isForumUserLoggedIn && currentUserName && !navigatedFromAdminDashboard && !isAdminUser && <span className="block text-sm text-primary">Welcome, {currentUserName}! Posting enabled.</span>}
                {isForumUserLoggedIn && currentUserName && !navigatedFromAdminDashboard && isAdminUser && <span className="block text-sm text-primary">Welcome, Admin {currentUserName}! Posting enabled.</span>}
              </CardDescription>
            </CardHeader>
            {isForumUserLoggedIn ? ( 
              <CardContent>
                <div className="space-y-3">
                  <Input
                    placeholder="Question Title (e.g., Best time to do cardio?)"
                    value={newQuestionTitle}
                    onChange={(e) => setNewQuestionTitle(e.target.value)}
                    className="text-base"
                    disabled={isLoading}
                  />
                  <Textarea
                    placeholder="Type your question here..."
                    value={newQuestionContent}
                    onChange={(e) => setNewQuestionContent(e.target.value)}
                    rows={3}
                    className="text-base"
                    disabled={isLoading}
                  />
                  <Button onClick={handleAskQuestion} disabled={isLoading} className="w-full sm:w-auto">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Post Question
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <Alert>
                  <KeyRound className="h-4 w-4 mr-2" />
                  <AlertTitle>Login to Participate</AlertTitle>
                  <AlertDescription>
                    You need to login with your 4-digit Registration ID to ask questions or post replies.
                    {currentUserName && !isForumUserLoggedIn && ` (Currently viewing as: ${currentUserName})`}
                  </AlertDescription>
                  <Button onClick={() => setShowRegIdLoginDialog(true)} className="mt-4">
                    Login with Registration ID
                  </Button>
                </Alert>
              </CardContent>
            )}
          </Card>

          {isLoadingQuestions && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary"/>
            </div>
          )}
          {fetchError && !isLoadingQuestions && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error Loading Questions</AlertTitle>
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          )}
          {!isLoadingQuestions && !fetchError && questions.length === 0 && (
            <Card className="shadow-md">
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No questions yet. Be the first to ask!</p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {!isLoadingQuestions && !fetchError && questions.map((question) => (
              <Card key={question.id} className="shadow-md">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-start space-x-3"> 
                      <Avatar>
                        <AvatarImage src={question.userAvatar || `https://placehold.co/40x40.png?text=${(question.userName || 'U').charAt(0)}`} alt={question.userName || 'User'} data-ai-hint="user avatar"/>
                        <AvatarFallback>{(question.userName || 'U').substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-xl">{question.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Asked by {question.userName || 'Anonymous'} on {formatDate(question.createdAt)}
                        </p>
                      </div>
                    </div>
                    {isForumUserLoggedIn && isAdminUser && ( // Only if forum session is admin
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(question.id); }} title="Delete Question" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                  <CardDescription className="pt-2 whitespace-pre-wrap">{question.content}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  {question.replies && question.replies.length > 0 && (
                    <div className="pl-4 border-l-2 border-primary/20 space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground">Replies: ({question.replies.length})</h4>
                      {question.replies.map((reply: ForumReply) => (
                        <div key={reply.id} className="flex items-start space-x-2 text-sm group"> 
                          <Avatar className="h-8 w-8">
                             <AvatarImage src={reply.userAvatar || `https://placehold.co/32x32.png?text=${(reply.userName || 'U').charAt(0)}`} alt={reply.userName || 'User'}  data-ai-hint="user avatar reply"/>
                             <AvatarFallback className="text-xs">{(reply.userName || 'U').substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-grow">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold">{reply.userName || 'Anonymous'}</span>
                                {isForumUserLoggedIn && isAdminUser && ( // Only if forum session is admin
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteReply(question.id, reply.id);}} title="Delete Reply" className="text-destructive hover:text-destructive opacity-50 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(reply.createdAt)} at {formatTime(reply.createdAt)}
                            </span>
                            <p className="whitespace-pre-wrap mt-1">{reply.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                   {replyingTo === question.id ? (
                      <div className="pl-4 space-y-2 pt-3">
                        <Textarea
                          placeholder="Write your reply..."
                          value={newReplyContent}
                          onChange={(e) => setNewReplyContent(e.target.value)}
                          rows={2}
                          className="text-sm"
                          disabled={isLoading}
                        />
                        <div className="flex justify-end space-x-2">
                           <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)} disabled={isLoading}>Cancel</Button>
                           <Button size="sm" onClick={() => handlePostReply(question.id)} disabled={isLoading}>
                             {isLoading && replyingTo === question.id ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Send className="mr-2 h-3 w-3" />}
                             Post Reply
                           </Button>
                        </div>
                      </div>
                    ) : isForumUserLoggedIn && ( 
                       <Button variant="outline" size="sm" onClick={() => handleReplyButtonClick(question.id)} className="mt-2">
                         Reply to this question
                       </Button>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
      <footer className="bg-black text-white p-4 w-full mt-auto">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="text-white hover:bg-gray-700 hover:text-white w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </footer>
    </div>
  );
}
