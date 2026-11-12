
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useRouteId } from "@/hooks/use-route-id";
import Image from "next/image";
import { format, addMonths, addYears, addDays, isAfter, differenceInDays, startOfDay as dateFnsStartOfDay, isBefore } from "date-fns";
import { User, Mail, Phone, CalendarDays, ImageOff, ShieldAlert, Loader2, LogOut, BadgeIcon, FileText, Clock, PauseCircle, CheckCircle, AlertCircle, XCircle, Save, Upload, Trash2, Edit3, Send, Bell, CreditCard, ChevronDown, MessageSquare } from "lucide-react"; // Added MessageSquare
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { Timestamp } from "firebase/firestore"; // For client-side, if needed, though server returns Dates

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getMemberByIdFromDb, updateMemberPauseDates, updateMemberPhoto, submitProfileUpdateRequest, getNotificationsForMember, markMemberNotificationsAsRead } from "@/actions/member-actions";
import type { NotificationType, ChangeRequest, StoredMember } from "@/lib/types/member-types"; 
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const requestChangeFormSchema = z.object({
  fieldToChange: z.enum(["userName", "userEmail", "userPhoneNumber", "userPlan", "startDate"], {
    required_error: "Please select a field to update.",
  }),
  newValue: z.string().min(1, { message: "New value cannot be empty." }),
}).superRefine((data, ctx) => {
  if (data.fieldToChange === 'userEmail') {
    const emailValidation = z.string().email("Invalid email format.").safeParse(data.newValue);
    if (!emailValidation.success) {
      emailValidation.error.errors.forEach(err => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err.message,
          path: ["newValue"],
        });
      });
    }
  }
  if (data.fieldToChange === 'userPhoneNumber') {
    const phoneValidation = z.string()
      .length(10, "Phone number must be 10 digits.")
      .regex(/^[0-9]+$/, "Phone must be digits.")
      .safeParse(data.newValue);
    if (!phoneValidation.success) {
       phoneValidation.error.errors.forEach(err => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err.message,
          path: ["newValue"],
        });
      });
    }
  }
  if (data.fieldToChange === 'userName') {
    const userNameValidation = z.string()
      .min(3, "Username must be at least 3 characters.")
      .max(50, "Username must be at most 50 characters.")
      .safeParse(data.newValue);
    if (!userNameValidation.success) {
      userNameValidation.error.errors.forEach(err => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err.message,
          path: ["newValue"],
        });
      });
    }
  }
  if (data.fieldToChange === 'userPlan') {
    const planEnum = z.enum(["Monthly Plan", "3 Month Plan", "6 Month Plan", "Yearly Plan", "Custom Plan"]);
    const planValidation = planEnum.safeParse(data.newValue);
    if (!planValidation.success) {
       ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid plan. Choose: Monthly Plan, 3 Month Plan, 6 Month Plan, Yearly Plan, Custom Plan.",
          path: ["newValue"],
        });
    }
  }
  if (data.fieldToChange === 'startDate') {
    // Basic check for date-like string; more robust validation if needed
    if (isNaN(new Date(data.newValue).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date format. E.g., YYYY-MM-DD or Jan 1, 2024.",
        path: ["newValue"],
      });
    }
  }
});

type RequestChangeFormSchemaType = z.infer<typeof requestChangeFormSchema>;


export default function MemberDetailPage() {
  const router = useRouter();
  const { toast } = useToast();
  const registrationId = useRouteId();

  const [member, setMember] = React.useState<StoredMember | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [editablePauseDates, setEditablePauseDates] = React.useState<Date[]>([]);
  const [initialPauseDates, setInitialPauseDates] = React.useState<Date[]>([]);
  const [isSavingPauseDates, setIsSavingPauseDates] = React.useState(false);
  const [pauseDatesPopoverOpen, setPauseDatesPopoverOpen] = React.useState(false);
  
  const [stagedPhotoDataUri, setStagedPhotoDataUri] = React.useState<string | undefined | null>(undefined); 
  const [isSavingPhoto, setIsSavingPhoto] = React.useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const [isSubmittingChangeRequest, setIsSubmittingChangeRequest] = React.useState(false);

  const [notifications, setNotifications] = React.useState<ClientNotificationType[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = React.useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = React.useState(false);
  const [notificationsError, setNotificationsError] = React.useState<string | null>(null);
  const [notificationsAccordionOpen, setNotificationsAccordionOpen] = React.useState(false);

  const requestChangeForm = useForm<RequestChangeFormSchemaType>({
    resolver: zodResolver(requestChangeFormSchema),
    defaultValues: {
      fieldToChange: undefined,
      newValue: "",
    },
  });

  const watchedFieldToChange = requestChangeForm.watch("fieldToChange");

  const getNewValuePlaceholder = (): string => {
    switch (watchedFieldToChange) {
      case "userName": return "Enter new username";
      case "userEmail": return "Enter new email";
      case "userPhoneNumber": return "Enter new 10-digit phone";
      case "userPlan": return "Monthly, 3 Month, 6 Month, Yearly, or Custom";
      case "startDate": return "New start date (YYYY-MM-DD)";
      default: return "Enter new value";
    }
  };
  
  const memoizedFetchMemberNotifications = React.useCallback(async () => {
    if (!registrationId) return;
    setIsLoadingNotifications(true);
    setNotificationsError(null);
    try {
      const result = await getNotificationsForMember(registrationId);
      if (result.success && result.notifications) {
        setNotifications(result.notifications as ClientNotificationType[]);
        const unreadCount = result.notifications.filter(n => !n.isRead).length;
        setUnreadNotificationCount(unreadCount);
      } else {
        setNotificationsError(result.message || "Failed to load notifications.");
        setNotifications([]);
        setUnreadNotificationCount(0);
      }
    } catch (err) {
      setNotificationsError("An unexpected error occurred while fetching notifications.");
      setNotifications([]);
      setUnreadNotificationCount(0);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [registrationId]);

  const fetchMemberData = React.useCallback(async () => {
    if (!registrationId) return;
    setIsLoading(true);
    setError(null);
    const result = await getMemberByIdFromDb(registrationId);
    if (result.success && result.member) {
      setMember(result.member);
      const pauseDatesFromDb = result.member.pauseDates?.map(d => new Date(d)) || [];
      setEditablePauseDates(pauseDatesFromDb);
      setInitialPauseDates(pauseDatesFromDb);
      setStagedPhotoDataUri(undefined); // Reset staged photo on member data fetch
      memoizedFetchMemberNotifications(); // Fetch notifications after member data
    } else {
      setError(result.message || "Failed to fetch member details.");
      setMember(null);
    }
    setIsLoading(false);
  }, [registrationId, memoizedFetchMemberNotifications]);

  React.useEffect(() => {
    fetchMemberData();
  }, [fetchMemberData]);


  React.useEffect(() => {
    let isMounted = true;
    async function handleAccordionOpen() {
      if (notificationsAccordionOpen && isMounted) {
        if (unreadNotificationCount > 0) {
          const markReadResult = await markMemberNotificationsAsRead(registrationId);
          if (markReadResult.success) {
            memoizedFetchMemberNotifications(); 
          } else {
            toast({
              variant: "destructive",
              title: "Error",
              description: "Could not mark notifications as read.",
            });
          }
        } else {
           memoizedFetchMemberNotifications();
        }
      }
    }
    handleAccordionOpen();
    return () => { isMounted = false; };
  }, [notificationsAccordionOpen, registrationId, memoizedFetchMemberNotifications, unreadNotificationCount, toast]);


  const getMaxPauseDaysForPlan = (plan: StoredMember["userPlan"] | undefined): number => {
    if (!plan) return 0;
    switch (plan) {
      case "Monthly Plan": return 2;
      case "3 Month Plan": return 7;
      case "6 Month Plan": return 15; // Added 6 Month Plan
      case "Yearly Plan": return 30;
      default: return 0;
    }
  };

  const maxPauseDays = member ? getMaxPauseDaysForPlan(member.userPlan) : 0;

  const statusInfo = React.useMemo(() => {
    if (!member) {
      return { text: "N/A", badgeVariant: "secondary" as const, Icon: FileText, endDateFormatted: "N/A", isModifiable: false, needsPayment: false, originalEndDate: null, actualEndDate: null };
    }

    let needsPayment = false;
    let isModifiable = false;
    let endDateFormatted = "N/A";
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
    let statusText = "N/A";
    let Icon = FileText;
    let originalEndDate: Date | null = null;
    let actualEndDate: Date | null = null;

    // Calculate end date based on plan, start date, and *editable* pause dates for UI responsiveness
    if (member.startDate && dateFnsStartOfDay(new Date(member.startDate)) && member.userPlan !== "Custom Plan") {
      originalEndDate = dateFnsStartOfDay(new Date(member.startDate));
       switch (member.userPlan) {
        case "Monthly Plan": originalEndDate = addMonths(originalEndDate, 1); break;
        case "3 Month Plan": originalEndDate = addMonths(originalEndDate, 3); break;
        case "6 Month Plan": originalEndDate = addMonths(originalEndDate, 6); break; // Added 6 Month Plan
        case "Yearly Plan": originalEndDate = addYears(originalEndDate, 1); break;
      }
      // originalEndDate = dateFnsStartOfDay(originalEndDate); // Already start of day

      actualEndDate = dateFnsStartOfDay(new Date(member.startDate)); 
      switch (member.userPlan) {
          case "Monthly Plan": actualEndDate = addMonths(actualEndDate, 1); break;
          case "3 Month Plan": actualEndDate = addMonths(actualEndDate, 3); break;
          case "6 Month Plan": actualEndDate = addMonths(actualEndDate, 6); break; // Added 6 Month Plan
          case "Yearly Plan": actualEndDate = addYears(actualEndDate, 1); break;
      }
      const pauseDaysCount = editablePauseDates.length;
      if (pauseDaysCount > 0) {
          actualEndDate = addDays(actualEndDate, pauseDaysCount);
      }
      // actualEndDate = dateFnsStartOfDay(actualEndDate); // Already start of day
      endDateFormatted = format(actualEndDate, "PPP");
    } else if (member.userPlan === "Custom Plan") {
      endDateFormatted = "Track Manually";
    }


    switch (member.accountStatus) {
      case 'pending_initial_payment':
        statusText = "Pending Payment"; // Updated text
        badgeVariant = "destructive";
        Icon = AlertCircle;
        needsPayment = true;
        isModifiable = false;
        break;
      case 'inactive_payment_rejected':
        statusText = "Payment Rejected";
        badgeVariant = "destructive";
        Icon = XCircle;
        needsPayment = true;
        isModifiable = false;
        break;
      case 'membership_expired':
        statusText = "Expired";
        badgeVariant = "outline";
        Icon = XCircle;
        needsPayment = true;
        isModifiable = false;
        break;
      case 'active':
        if (member.userPlan === "Custom Plan") {
          statusText = "Active (Custom)";
          badgeVariant = "default";
          Icon = CheckCircle;
          isModifiable = false; 
          needsPayment = false; 
        } else if (actualEndDate) { 
          const today = dateFnsStartOfDay(new Date());
          if (isAfter(today, actualEndDate)) {
            statusText = "Expired (Date)"; 
            badgeVariant = "outline";
            Icon = XCircle;
            needsPayment = true;
            isModifiable = false;
          } else {
            const daysUntilExpiry = differenceInDays(actualEndDate, today);
            if (daysUntilExpiry <= 2) {
              statusText = "Expiring Soon";
              badgeVariant = "destructive";
              Icon = AlertCircle;
              needsPayment = true; 
              isModifiable = true; 
            } else {
              statusText = "Active";
              badgeVariant = "default";
              Icon = CheckCircle;
              needsPayment = false;
              isModifiable = true;
            }
          }
        } else { 
          statusText = "Active (Info N/A)";
          badgeVariant = "default";
          Icon = CheckCircle;
          isModifiable = false; 
          needsPayment = false; 
        }
        break;
      default: 
        statusText = "N/A";
        badgeVariant = "secondary";
        Icon = FileText;
        isModifiable = false;
        needsPayment = true; 
        break;
    }
    
    if (member.userPlan === "Custom Plan") {
      isModifiable = false;
    }

    return { text: statusText, badgeVariant, Icon, endDateFormatted, isModifiable, needsPayment, originalEndDate, actualEndDate };
  }, [member, editablePauseDates]);


  const handlePauseDateSelect = (dates: Date[] | undefined) => {
    let newDates = dates === undefined ? [] : dates.map(d => dateFnsStartOfDay(d));
    if (newDates.length > maxPauseDays) {
      newDates = newDates.slice(0, maxPauseDays);
      toast({
        title: "Pause Day Limit Reached",
        description: `You can select a maximum of ${maxPauseDays} pause days for this plan.`,
        variant: "default",
      });
    }
    setEditablePauseDates(newDates);
    if (newDates.length >= maxPauseDays && maxPauseDays > 0) {
        setPauseDatesPopoverOpen(false);
    }
  };
  
  const handleSavePauseDates = async () => {
    if (!member) return;
    setIsSavingPauseDates(true);
    const result = await updateMemberPauseDates(member.newRegistrationId, editablePauseDates);
    if (result.success && result.member) {
      toast({
        title: "Pause Dates Updated",
        description: result.message,
      });
      setMember(result.member); 
      const pauseDatesFromDb = result.member.pauseDates?.map(d => new Date(d)) || [];
      setEditablePauseDates(pauseDatesFromDb);
      setInitialPauseDates(pauseDatesFromDb);
    } else {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: result.message || "Could not update pause dates.",
      });
    }
    setIsSavingPauseDates(false);
  };

  const pauseDatesChanged = React.useMemo(() => {
    if (initialPauseDates.length !== editablePauseDates.length) return true;
    const initialTimestamps = initialPauseDates.map(d => d.getTime()).sort();
    const editableTimestamps = editablePauseDates.map(d => d.getTime()).sort();
    return !initialTimestamps.every((val, index) => val === editableTimestamps[index]);
  }, [initialPauseDates, editablePauseDates]);

  const handlePhotoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStagedPhotoDataUri(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePhoto = async () => {
    if (!member || stagedPhotoDataUri === undefined) return; 
    setIsSavingPhoto(true);
    
    const photoToSave = stagedPhotoDataUri === null ? "" : stagedPhotoDataUri;

    const result = await updateMemberPhoto(member.newRegistrationId, photoToSave);
    if (result.success && result.member) {
      toast({
        title: "Photo Updated",
        description: result.message,
      });
      setMember(result.member); 
      setStagedPhotoDataUri(undefined); 
      if (photoInputRef.current) {
        photoInputRef.current.value = ""; 
      }
    } else {
      toast({
        variant: "destructive",
        title: "Photo Update Failed",
        description: result.message || "Could not update photo.",
      });
    }
    setIsSavingPhoto(false);
  };

  const handleDiscardPhotoChange = () => {
    setStagedPhotoDataUri(undefined); 
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const handleTriggerRemoveSavedPhoto = () => {
    setStagedPhotoDataUri(null); 
  };

  const handleLogout = () => {
    localStorage.removeItem("loggedInMemberId");
    // Clear forum-specific localStorage items
    localStorage.removeItem("forumLoggedInRegistrationId");
    localStorage.removeItem("forumUserDisplayName");
    localStorage.removeItem("isAdminUser");
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    router.push("/");
  };

  const onSubmitChangeRequest = async (values: RequestChangeFormSchemaType) => {
    if (!member) return;
    setIsSubmittingChangeRequest(true);
    const result = await submitProfileUpdateRequest(
      member.newRegistrationId,
      values.fieldToChange as ChangeRequest['fieldName'], 
      values.newValue
    );
    if (result.success) {
      toast({
        title: "Update Request Submitted",
        description: result.message,
      });
      requestChangeForm.reset();
      fetchMemberData(); // Refetch member data to show current values after request
    } else {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: result.message || "Could not submit update request.",
      });
    }
    setIsSubmittingChangeRequest(false);
  };

  let payDuesText = "Pay your dues";
  let payDuesColorClass = "text-white hover:bg-gray-700/50 hover:text-white";
  let payDuesAction = () => router.push('/member/payment');
  
  if (member && statusInfo) {
    if (statusInfo.needsPayment) {
        payDuesText = "Pay your dues";
        payDuesColorClass = "text-red-400 hover:bg-gray-700/50 hover:text-red-300";
        // Action remains router.push('/member/payment')
    } else { // Does not need payment (e.g., Active and not expiring soon)
        payDuesText = "No Dues Pending";
        payDuesColorClass = "text-green-400 hover:bg-gray-700/50 hover:text-green-300"; 
        payDuesAction = () => toast({ title: "No Dues Pending", description: "Your membership is up to date!" });
    }
  }


  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-muted/40">
        <Loader2 className="h-16 w-16 text-primary animate-spin" />
        <p className="mt-4 text-lg font-semibold text-muted-foreground">Loading Member Details...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-muted/40">
        <Alert variant="destructive" className="max-w-md">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Error Loading Details</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push("/")} className="mt-6">
          Go to Login
        </Button>
      </main>
    );
  }

  if (!member) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-muted/40">
         <Alert variant="destructive" className="max-w-md">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Member Not Found</AlertTitle>
          <AlertDescription>No member found with Registration ID: {registrationId}</AlertDescription>
        </Alert>
         <Button onClick={() => router.push("/")} className="mt-6">
          Go to Login
        </Button>
      </main>
    );
  }
  
  const currentDisplayPhoto = stagedPhotoDataUri === null 
    ? "https://placehold.co/100x100.png" 
    : (stagedPhotoDataUri !== undefined ? stagedPhotoDataUri : (member.userPhoto || "https://placehold.co/100x100.png"));

  const photoDataHint = stagedPhotoDataUri === null 
    ? "profile avatar placeholder" 
    : (stagedPhotoDataUri !== undefined || member.userPhoto) ? "profile avatar" : "profile avatar placeholder";


  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 p-4 sm:p-6 md:p-8">
      <main className="w-full max-w-2xl mb-8">
        <Card className="w-full shadow-xl">
          <CardHeader className="flex flex-row items-start justify-between space-x-4 pb-4">
            <div className="flex-1">
              <CardTitle className="text-3xl font-bold text-primary">
                Welcome, {member.userName}!
              </CardTitle>
              <CardDescription className="text-md">
                Here are your membership details.
              </CardDescription>
              <Button asChild variant="link" className="px-0 pt-2 text-base">
                <Link href={`/forum?member_id=${member.newRegistrationId}`}>
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Go to Community Forum
                </Link>
              </Button>
            </div>
            <div className="flex flex-col items-center space-y-2">
              <Avatar className="h-24 w-24 border-2 border-primary">
                <AvatarImage src={currentDisplayPhoto} alt={member.userName} data-ai-hint={photoDataHint}/>
                <AvatarFallback>
                  <ImageOff className="h-10 w-10 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <input 
                type="file" 
                ref={photoInputRef} 
                onChange={handlePhotoFileChange} 
                accept="image/*" 
                className="hidden" 
                id="memberPhotoInput"
              />
              <Button variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} className="w-full">
                <Upload className="mr-2 h-3 w-3" /> Change
              </Button>
              {stagedPhotoDataUri !== undefined && ( 
                <div className="flex space-x-2 w-full">
                  <Button variant="default" size="sm" onClick={handleSavePhoto} disabled={isSavingPhoto} className="flex-1">
                    {isSavingPhoto ? <Loader2 className="mr-2 h-3 w-3 animate-spin"/> : <Save className="mr-2 h-3 w-3" />}
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDiscardPhotoChange} disabled={isSavingPhoto} className="flex-1">
                    <XCircle className="mr-2 h-3 w-3" /> Discard
                  </Button>
                </div>
              )}
              {stagedPhotoDataUri === undefined && member.userPhoto && (
                  <Button variant="destructive" size="sm" onClick={handleTriggerRemoveSavedPhoto} className="w-full">
                    <Trash2 className="mr-2 h-3 w-3" /> Remove Current
                  </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
                <BadgeIcon className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Registration ID</p>
                  <p className="text-muted-foreground">{member.newRegistrationId}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
                <User className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Username</p>
                  <p className="text-muted-foreground">{member.userName}</p>
                </div>
              </div>
              {member.userEmail && (
                <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
                  <Mail className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Email</p>
                    <p className="text-muted-foreground">{member.userEmail}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
                <Phone className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Phone Number</p>
                  <p className="text-muted-foreground">{member.userPhoneNumber}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-background rounded-md border md:col-span-2">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Membership Plan</p>
                  <p className="text-muted-foreground">
                    {member.userPlan}
                    {member.userPlan === "Custom Plan" && member.customPlanDuration && (
                      <span className="ml-1">({member.customPlanDuration})</span>
                    )}
                    {member.userPlan === "Custom Plan" && member.customPlanPrice && (
                      <span className="ml-1">- {member.customPlanPrice} RS</span>
                    )}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
                <CalendarDays className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Start Date</p>
                  <p className="text-muted-foreground">{member.startDate ? format(new Date(member.startDate), "PPP") : 'N/A'}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Membership End Date</p>
                  <p className="text-muted-foreground">{statusInfo.endDateFormatted}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-background rounded-md border">
                <statusInfo.Icon className={`h-5 w-5 ${statusInfo.badgeVariant === 'default' ? 'text-green-500' : statusInfo.badgeVariant === 'destructive' ? 'text-red-500' : 'text-muted-foreground'}`} />
                <div>
                  <p className="font-medium text-foreground">Status</p>
                  <Badge variant={statusInfo.badgeVariant} className="text-xs">{statusInfo.text}</Badge>
                </div>
              </div>
              
              {statusInfo.isModifiable && (
                <div className="md:col-span-2 p-3 bg-background rounded-md border space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-foreground flex items-center">
                      <PauseCircle className="h-5 w-5 text-primary mr-2" />
                      Manage Pause Days
                    </h4>
                    {pauseDatesChanged && !isSavingPauseDates && (
                        <Button size="sm" onClick={handleSavePauseDates}>
                          <Save className="mr-2 h-4 w-4" /> Save Changes
                        </Button>
                    )}
                    {isSavingPauseDates && (
                      <Button size="sm" disabled>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <p><strong>Allowed:</strong> {maxPauseDays} days</p>
                    <p><strong>Used:</strong> {editablePauseDates.length} day(s)</p>
                  </div>
                  
                  <Popover open={pauseDatesPopoverOpen} onOpenChange={setPauseDatesPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {editablePauseDates.length > 0 
                          ? `${editablePauseDates.length} day(s) selected` 
                          : "Select pause dates"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="multiple"
                        selected={editablePauseDates}
                        onSelect={handlePauseDateSelect}
                        disabled={(date) => {
                          const today = dateFnsStartOfDay(new Date());
                          const startDate = member.startDate ? dateFnsStartOfDay(new Date(member.startDate)) : today;
                          if (isBefore(date, today) || isBefore(date, startDate)) return true;
                          if (statusInfo.originalEndDate && isAfter(date, addDays(statusInfo.originalEndDate, maxPauseDays))) return true; 
                          return false;
                        }}
                        fromDate={member.startDate ? new Date(member.startDate) : undefined}
                        toDate={statusInfo.originalEndDate ? addDays(statusInfo.originalEndDate, maxPauseDays + 7) : undefined} 
                        modifiers={{
                          highlightedStartDate: member.startDate ? dateFnsStartOfDay(new Date(member.startDate)) : undefined,
                          highlightedEndDate: statusInfo.actualEndDate, 
                        }}
                        modifiersClassNames={{
                          highlightedStartDate: 'bg-green-200 dark:bg-green-700 text-green-900 dark:text-green-100 rounded-md',
                          highlightedEndDate: 'bg-red-200 dark:bg-red-700 text-red-900 dark:text-red-100 rounded-md',
                        }}
                      />
                    </PopoverContent>
                  </Popover>

                  {editablePauseDates.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Selected Pause Dates:</p>
                      <div className="flex flex-wrap gap-1">
                        {editablePauseDates.map((date, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {format(new Date(date), "PPP")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

                {member.userPlan !== "Custom Plan" && !statusInfo.isModifiable && (
                <div className="flex items-start space-x-3 p-3 bg-background rounded-md border md:col-span-2">
                  <PauseCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Pause Days Used ({member.pauseDates?.length || 0})</p>
                    {member.pauseDates && member.pauseDates.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {member.pauseDates.map((date, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {format(new Date(date), "PPP")}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">No pause days used.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <div className="w-full max-w-2xl bg-gray-900 text-white p-4 rounded-lg shadow-xl">
        <div className="flex flex-col md:flex-row md:justify-between gap-4">
          {/* Actions Group */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 overflow-x-auto">
            <Button variant="ghost" className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm flex-shrink-0" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
            <Button asChild variant="ghost" className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm flex-shrink-0">
              <Link href="/member/services">
                <FileText className="mr-2 h-4 w-4" />
                Schedule/Diet
              </Link>
            </Button>
            <Button 
              variant="ghost" 
              className={cn("justify-start font-bold w-full sm:w-auto text-sm flex-shrink-0", payDuesColorClass)}
              onClick={payDuesAction}
            >
              <CreditCard className="mr-2 h-4 w-4" /> 
              {payDuesText}
            </Button>
          </div>

          {/* Accordions Group */}
          <div className="flex flex-col gap-4 flex-1 min-w-0 md:max-w-md">
            {member.canRequestProfileUpdates && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="request-update" className="border-b-0">
                  <AccordionTrigger className="text-sm font-medium hover:bg-gray-700/50 rounded-md p-3 flex items-center justify-between w-full text-white [&>svg]:text-white [&[data-state=open]>svg]:text-white">
                    <div className="flex items-center font-bold">
                      <Edit3 className="mr-2 h-4 w-4" />
                      Request Profile Update
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="p-3 pt-4 bg-gray-800 text-white rounded-b-md">
                      <Form {...requestChangeForm}>
                        <form onSubmit={requestChangeForm.handleSubmit(onSubmitChangeRequest)} className="space-y-3">
                          <FormField
                            control={requestChangeForm.control}
                            name="fieldToChange"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs text-gray-300">Field to Update</FormLabel>
                                <Select onValueChange={(value) => {
                                  field.onChange(value);
                                  requestChangeForm.setValue('newValue', ''); 
                                  requestChangeForm.clearErrors('newValue');
                                }} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white h-9 text-xs focus:ring-primary focus:border-primary">
                                      <SelectValue placeholder="Select field..." />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-gray-800 text-white border-gray-600">
                                    <SelectItem value="userName" className="text-xs hover:!bg-gray-700 hover:!text-white">Username</SelectItem>
                                    <SelectItem value="userEmail" className="text-xs hover:!bg-gray-700 hover:!text-white">Email</SelectItem>
                                    <SelectItem value="userPhoneNumber" className="text-xs hover:!bg-gray-700 hover:!text-white">Phone Number</SelectItem>
                                    <SelectItem value="userPlan" className="text-xs hover:!bg-gray-700 hover:!text-white">Membership Plan</SelectItem>
                                    <SelectItem value="startDate" className="text-xs hover:!bg-gray-700 hover:!text-white">Start Date</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage className="text-xs text-red-400" />
                              </FormItem>
                            )}
                          />
                          {watchedFieldToChange && (
                            <FormField
                              control={requestChangeForm.control}
                              name="newValue"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs text-gray-300">New Value</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder={getNewValuePlaceholder()}
                                      {...field} 
                                      className="bg-gray-700 border-gray-600 text-white h-9 text-xs placeholder:text-gray-400 focus:ring-primary focus:border-primary"
                                    />
                                  </FormControl>
                                  <FormMessage className="text-xs text-red-400" />
                                </FormItem>
                              )}
                            />
                          )}
                          <Button type="submit" disabled={isSubmittingChangeRequest || !watchedFieldToChange} className="w-full h-9 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
                            {isSubmittingChangeRequest ? (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="mr-2 h-3 w-3" />
                            )}
                            Submit Request
                          </Button>
                        </form>
                      </Form>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="notifications" className="border-b-0">
                <AccordionTrigger 
                  className="text-sm font-medium hover:bg-gray-700/50 rounded-md p-3 flex items-center justify-between w-full text-white [&>svg]:text-white [&[data-state=open]>svg]:text-white"
                  onClick={() => setNotificationsAccordionOpen(!notificationsAccordionOpen)}
                >
                  <div className="flex items-center font-bold">
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications ({unreadNotificationCount})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-3 pt-2 bg-gray-800 text-white rounded-b-md max-h-48 overflow-y-auto">
                    {isLoadingNotifications ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : notificationsError ? (
                      <Alert variant="destructive" className="bg-red-900/30 border-red-700 text-red-300 p-2 text-xs">
                          <AlertCircle className="h-3 w-3" />
                          <AlertTitle className="text-xs font-semibold">Error</AlertTitle>
                          <AlertDescription className="text-xs">{notificationsError}</AlertDescription>
                      </Alert>
                    ) : notifications.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center">No new notifications.</p>
                    ) : (
                      <ul className="space-y-2">
                        {notifications.map(notif => (
                          <li key={notif.notificationId} className={`p-2.5 rounded-md border ${!notif.isRead ? 'bg-gray-700 border-gray-600' : 'bg-gray-700/50 border-gray-600/50'} text-xs`}>
                            <p className={`font-medium mb-0.5 ${!notif.isRead ? 'text-white font-semibold' : 'text-gray-300'}`}>{notif.message}</p>
                            <p className="text-xs text-gray-400">
                              From: {notif.senderName} - {notif.timestamp ? format(new Date(notif.timestamp), "PPp") : 'N/A'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  );
}

// Type for client-side notifications, ensuring dates are JS Dates
interface ClientNotificationType extends Omit<NotificationType, 'timestamp'> {
  timestamp: Date; // Ensure timestamp is a JS Date on the client
}
