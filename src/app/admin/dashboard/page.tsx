
"use client"; 

import * as React from "react"; 
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from 'next/dynamic';
import { format, addMonths, addYears, addDays, isAfter, differenceInDays, startOfDay, isDate } from "date-fns";
import { LogOut, UserPlus, Users, ImageOff, ShieldAlert, ChevronDown, ChevronUp, Loader2, Pencil, Trash2, Edit, MessageSquareWarning, CheckSquare, XSquare, SendHorizontal, Bell, Settings2, ShieldCheck, ShieldOff, IndianRupee, CheckCircle, XCircle, CreditCard, MessageSquare } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMembers } from "@/context/MemberContext"; 
import type { StoredMember, PaymentConfirmationRequest, ChangeRequest, NotificationType, RegistrationIdReminderRequest, AccountStatus } from "@/lib/types/member-types";
import { getMembersFromDb, deleteMemberFromDb, getProfileUpdateRequests, dismissProfileUpdateRequest, sendNotificationToMember, toggleProfileUpdatePermission, getPendingPaymentConfirmations, confirmPayment, rejectPayment, getPendingRegistrationIdReminders, resolveRegistrationIdReminder } from "@/actions/member-actions";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox"; // Added Checkbox import

import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const RegisteredMembersTable = dynamic(() => 
  import('@/components/admin/dashboard/registered-members-table').then(mod => mod.RegisteredMembersTable), 
  { 
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <p className="text-lg font-semibold text-muted-foreground">Loading Members Table...</p>
      </div>
    )
  }
);

const sendNotificationSchema = z.object({
  sendToAll: z.boolean().default(false),
  targetMemberId: z.string().optional(),
  message: z.string().min(5, "Message must be at least 5 characters.").max(500, "Message must be at most 500 characters."),
}).superRefine((data, ctx) => {
  if (!data.sendToAll && (!data.targetMemberId || data.targetMemberId.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please select a member or check 'Send to All'.",
      path: ["targetMemberId"],
    });
  }
});
type SendNotificationSchemaType = z.infer<typeof sendNotificationSchema>;

const calculateEndDateForDisplay = (startDate: Date | undefined, userPlan: StoredMember['userPlan'], pauseDates: Date[] | undefined): Date | null => {
  if (!startDate || !isDate(startDate) || userPlan === "Custom Plan") {
    return null;
  }
  let endDate = new Date(startDate);
  switch (userPlan) {
    case "Monthly Plan": endDate = addMonths(endDate, 1); break;
    case "3 Month Plan": endDate = addMonths(endDate, 3); break;
    case "6 Month Plan": endDate = addMonths(endDate, 6); break; // Added 6 Month Plan
    case "Yearly Plan": endDate = addYears(endDate, 1); break;
    default: return null;
  }
  if (pauseDates && pauseDates.length > 0) {
    endDate = addDays(endDate, pauseDates.length);
  }
  return startOfDay(endDate);
};

const MAIN_MEMBER_ID_STORAGE_KEY = "loggedInMemberId"; 


export default function AdminDashboardPage() {
  const { members, setMembers, refetchMembersId, triggerRefetchMembers, refetchPaymentsId, triggerRefetchPayments } = useMembers();
  const router = useRouter();
  
  const [isLoadingMembers, setIsLoadingMembers] = React.useState(true);
  const [fetchMembersError, setFetchMembersError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [memberPendingDeletion, setMemberPendingDeletion] = React.useState<{id: string, name: string} | null>(null);

  const [changeRequests, setChangeRequests] = React.useState<(ChangeRequest & { requestId: string })[]>([]); 
  const [isLoadingRequests, setIsLoadingRequests] = React.useState(true);
  const [fetchRequestsError, setFetchRequestsError] = React.useState<string | null>(null);
  const [refetchRequestsId, setRefetchRequestsId] = React.useState(0);

  const [paymentConfirmations, setPaymentConfirmations] = React.useState<(PaymentConfirmationRequest & { confirmationId: string })[]>([]); 
  const [isLoadingPayments, setIsLoadingPayments] = React.useState(true);
  const [fetchPaymentsError, setFetchPaymentsError] = React.useState<string | null>(null);

  const [registrationIdReminders, setRegistrationIdReminders] = React.useState<(RegistrationIdReminderRequest & { reminderId: string; matchedMemberId?: string; memberName?: string; matchedMemberName?: string; })[]>([]);
  const [isLoadingRegIdReminders, setIsLoadingRegIdReminders] = React.useState(true);
  const [fetchRegIdRemindersError, setFetchRegIdRemindersError] = React.useState<string | null>(null);
  const [refetchRegIdRemindersId, setRefetchRegIdRemindersId] = React.useState(0);


  const [openCardSections, setOpenCardSections] = React.useState<Record<string, boolean>>({
    requests: false, 
    members: false, 
    payments: false,
    regIdReminders: false,
  });

  const [openCollapsibles, setOpenCollapsibles] = React.useState<Record<string, boolean>>({});
  const toggleCollapsible = (id: string) => {
    setOpenCollapsibles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [isSendingNotification, setIsSendingNotification] = React.useState(false);
  const [fetchedMembersForSelect, setFetchedMembersForSelect] = React.useState<StoredMember[]>([]); 

  const notificationForm = useForm<SendNotificationSchemaType>({
    resolver: zodResolver(sendNotificationSchema),
    defaultValues: {
      sendToAll: false,
      targetMemberId: "",
      message: "",
    },
  });

  const watchSendToAll = notificationForm.watch("sendToAll");

  React.useEffect(() => {
    if (watchSendToAll) {
      notificationForm.setValue("targetMemberId", ""); // Clear target member if "send to all" is checked
      notificationForm.clearErrors("targetMemberId");
    }
  }, [watchSendToAll, notificationForm]);

  const getMembershipStatus = React.useCallback((member: StoredMember): { text: string; badgeVariant: "default" | "secondary" | "destructive" | "outline"; rowClass: string; endDateFormatted: string } => {
    const calculatedEndDate = calculateEndDateForDisplay(member.startDate, member.userPlan, member.pauseDates);
    const endDateFormatted = calculatedEndDate ? format(calculatedEndDate, "PPP") : (member.userPlan === "Custom Plan" ? "Track Manually" : "N/A");

    switch (member.accountStatus) {
        case 'pending_initial_payment':
            return { text: "Pending Payment", badgeVariant: "destructive" as const, rowClass: "", endDateFormatted: "N/A" }; // Updated text
        case 'inactive_payment_rejected':
            return { text: "Payment Rejected", badgeVariant: "destructive" as const, rowClass: "opacity-70", endDateFormatted: "N/A" };
        case 'membership_expired':
            return { text: "Expired", badgeVariant: "outline" as const, rowClass: "bg-muted/60 opacity-70", endDateFormatted };
        case 'paused': 
            return { text: "Paused", badgeVariant: "secondary" as const, rowClass: "", endDateFormatted };
        case 'active':
            if (member.userPlan === "Custom Plan") {
                return { text: "Active (Custom)", badgeVariant: "default" as const, rowClass: "", endDateFormatted: "Track Manually" };
            }
            if (!calculatedEndDate) { 
                return { text: "Active (Info N/A)", badgeVariant: "default" as const, rowClass: "", endDateFormatted: "N/A" };
            }
            const today = startOfDay(new Date());
            if (isAfter(today, calculatedEndDate)) {
                return { text: "Expired (Date)", badgeVariant: "outline" as const, rowClass: "bg-muted/60 opacity-70", endDateFormatted };
            }
            const daysUntilExpiry = differenceInDays(calculatedEndDate, today);
            if (daysUntilExpiry <= 2) {
                return { text: "Expiring Soon", badgeVariant: "destructive" as const, rowClass: "", endDateFormatted };
            }
            return { text: "Active", badgeVariant: "default" as const, rowClass: "", endDateFormatted };
        default:
             if (!member.startDate || !isDate(member.startDate) || member.userPlan === "Custom Plan") {
                return { text: "N/A", badgeVariant: "secondary" as const, rowClass: "", endDateFormatted: member.userPlan === "Custom Plan" ? "Track Manually" : "N/A" };
            }
            if (calculatedEndDate) {
                const today = startOfDay(new Date());
                if (isAfter(today, calculatedEndDate)) {
                    return { text: "Expired (Date)", badgeVariant: "outline" as const, rowClass: "bg-muted/60 opacity-70", endDateFormatted };
                }
                const daysUntilExpiry = differenceInDays(calculatedEndDate, today);
                if (daysUntilExpiry <= 2) {
                    return { text: "Expiring Soon", badgeVariant: "destructive" as const, rowClass: "", endDateFormatted };
                }
                return { text: "Active (Fallback)", badgeVariant: "default" as const, rowClass: "", endDateFormatted };
            }
            return { text: "N/A (Status Unknown)", badgeVariant: "secondary" as const, rowClass: "", endDateFormatted: "N/A" };
    }
  }, []);


  React.useEffect(() => {
    async function fetchMembersForDropdown() {
      console.log("Dashboard: fetchMembersForDropdown called - expecting data from 'kkrdb' collection via server action");
      const result = await getMembersFromDb();
      if (result && result.success && Array.isArray(result.members)) {
        const currentMembers = result.members;
        setFetchedMembersForSelect(currentMembers);
        console.log("Dashboard: Fetched members for select dropdown:", currentMembers.length);
      } else {
        const errorMessage = result?.message || "Failed to fetch members for dropdown.";
         console.error(
          "Dashboard: fetchMembersForDropdown call to getMembersFromDb FAILED. Server message:", 
          errorMessage, 
          "Type of result:", typeof result,
          "Result keys:", result ? Object.keys(result) : "N/A",
          "Full result object (stringified):", JSON.stringify(result),
          "\n\n--->>> IMPORTANT: The root cause is a server-side error. Check your server terminal logs for details from 'getMembersFromDb'. Please provide these server logs for further assistance. <<<---"
        );
        setFetchMembersError(errorMessage); 
      }
    }
    fetchMembersForDropdown();
  }, [refetchMembersId]); 

  const triggerRefetchRequests = () => setRefetchRequestsId(id => id + 1);
  const triggerRefetchRegIdReminders = () => setRefetchRegIdRemindersId(id => id + 1);

  const toggleCardSection = (sectionKey: string) => {
    setOpenCardSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  React.useEffect(() => {
    async function fetchMembersData() {
      console.log("Dashboard: fetchMembersData called due to refetchMembersId or mount:", refetchMembersId, "- expecting data from 'kkrdb' collection via server action");
      setIsLoadingMembers(true);
      setFetchMembersError(null);
      try {
        const result = await getMembersFromDb();
        console.log("Dashboard: getMembersFromDb result for main list (stringified):", JSON.stringify(result));
        if (result && result.success) {
          const fetchedMembers = Array.isArray(result.members) ? result.members : [];
          if (fetchedMembers.length > 0) {
            setMembers(fetchedMembers); 
            console.log("Dashboard: Successfully fetched main member list (from 'kkrdb' via server action):", fetchedMembers.length);
          } else {
            setMembers([]);
            console.log("Dashboard: Successfully fetched, but no members found or members array is empty.");
          }
        } else {
          const errorMsg = result?.message || "Failed to fetch main members list.";
           console.error(
            "Dashboard: fetchMembersData call to getMembersFromDb FAILED. Server message:", 
            errorMsg, 
            "Type of result:", typeof result,
            "Result keys:", result ? Object.keys(result) : "N/A",
            "Full result object (stringified):", JSON.stringify(result),
            "\n\n--->>> IMPORTANT: The root cause is a server-side error. Check your server terminal logs for details from 'getMembersFromDb'. Please provide these server logs for further assistance. <<<---"
          );
          setFetchMembersError(errorMsg);
          setMembers([]); 
        }
      } catch (error) {
        console.error("Dashboard: Error fetching members on client:", error);
        setFetchMembersError("An unexpected error occurred while fetching members.");
        setMembers([]); 
      } finally {
        setIsLoadingMembers(false);
      }
    }
    fetchMembersData();
  }, [setMembers, refetchMembersId]); 

  React.useEffect(() => {
    async function fetchChangeRequestsData() {
      setIsLoadingRequests(true);
      setFetchRequestsError(null);
      try {
        const result = await getProfileUpdateRequests();
        if (result.success && result.requests) {
          setChangeRequests(result.requests);
        } else {
          setFetchRequestsError(result.message || "Failed to fetch change requests.");
          setChangeRequests([]);
        }
      } catch (error) {
        console.error("Error fetching change requests:", error);
        setFetchRequestsError("An unexpected error occurred while fetching change requests.");
        setChangeRequests([]);
      } finally {
        setIsLoadingRequests(false);
      }
    }
    fetchChangeRequestsData();
  }, [refetchRequestsId]);

  React.useEffect(() => {
    async function fetchPaymentConfirmationsData() {
      setIsLoadingPayments(true);
      setFetchPaymentsError(null);
      try {
        const result = await getPendingPaymentConfirmations();
        if (result.success && result.requests) {
          setPaymentConfirmations(result.requests);
        } else {
          setFetchPaymentsError(result.message || "Failed to fetch payment confirmations.");
          setPaymentConfirmations([]);
        }
      } catch (error) {
        console.error("Error fetching payment confirmations:", error);
        setFetchPaymentsError("An unexpected error occurred while fetching payment confirmations.");
        setPaymentConfirmations([]);
      } finally {
        setIsLoadingPayments(false);
      }
    }
    fetchPaymentConfirmationsData();
  }, [refetchPaymentsId]); 
  
  React.useEffect(() => {
    async function fetchRegIdRemindersData() {
      setIsLoadingRegIdReminders(true);
      setFetchRegIdRemindersError(null);
      try {
        const result = await getPendingRegistrationIdReminders();
        if (result.success && result.reminders) {
          setRegistrationIdReminders(result.reminders as (RegistrationIdReminderRequest & { reminderId: string; matchedMemberId?: string; memberName?: string; matchedMemberName?: string; })[]);
        } else {
          setFetchRegIdRemindersError(result.message || "Failed to fetch Reg ID reminders.");
          setRegistrationIdReminders([]);
        }
      } catch (error) {
        console.error("Error fetching Reg ID reminders:", error);
        setFetchRegIdRemindersError("An unexpected error occurred while fetching Reg ID reminders.");
        setRegistrationIdReminders([]);
      } finally {
        setIsLoadingRegIdReminders(false);
      }
    }
    fetchRegIdRemindersData();
  }, [refetchRegIdRemindersId]);


  const handleEdit = (memberId: string) => {
    console.log("Edit member clicked:", memberId);
    router.push(`/admin/users/edit/${memberId}`);
  };

  const handleDeleteInitiate = (memberId: string, memberName: string) => {
    setMemberPendingDeletion({ id: memberId, name: memberName });
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (!memberPendingDeletion) return;

    const result = await deleteMemberFromDb(memberPendingDeletion.id);
    if (result.success) {
      toast({
        title: "Member Deleted",
        description: `Member ${memberPendingDeletion.name} (ID: ${memberPendingDeletion.id}) has been deleted.`,
      });
      triggerRefetchMembers(); 
    } else {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: result.message || "Could not delete member.",
      });
    }
    setShowDeleteConfirm(false);
    setMemberPendingDeletion(null);
  };

  const handleDismissRequest = async (requestId: string) => {
    const result = await dismissProfileUpdateRequest(requestId);
    if (result.success) {
      toast({
        title: "Request Dismissed",
        description: result.message,
      });
      triggerRefetchRequests();
    } else {
      toast({
        variant: "destructive",
        title: "Dismissal Failed",
        description: result.message,
      });
    }
  };

  const handleEditMemberForRequest = (memberId: string) => {
    router.push(`/admin/users/edit/${memberId}`);
  };

  const handleConfirmPayment = async (confirmationId: string) => {
    const result = await confirmPayment(confirmationId);
    if (result.success) {
      toast({
        title: "Payment Confirmed",
        description: result.message,
      });
      triggerRefetchPayments();
      triggerRefetchMembers(); 
    } else {
      toast({
        variant: "destructive",
        title: "Payment Confirmation Failed",
        description: result.message,
      });
    }
  };

  const handleRejectPayment = async (confirmationId: string) => {
    const result = await rejectPayment(confirmationId);
     if (result.success) {
      toast({
        title: "Payment Rejected",
        description: result.message,
      });
      triggerRefetchPayments();
      triggerRefetchMembers(); 
    } else {
      toast({
        variant: "destructive",
        title: "Payment Rejection Failed",
        description: result.message,
      });
    }
  };
  
  const handleResolveRegIdReminder = async (reminderId: string) => {
    const result = await resolveRegistrationIdReminder(reminderId);
    if (result.success) {
      toast({
        title: "Reminder Resolved",
        description: result.message,
      });
      triggerRefetchRegIdReminders();
    } else {
      toast({
        variant: "destructive",
        title: "Resolution Failed",
        description: result.message,
      });
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(MAIN_MEMBER_ID_STORAGE_KEY);
      localStorage.removeItem("forumLoggedInRegistrationId");
      localStorage.removeItem("forumUserDisplayName");
      localStorage.removeItem("isAdminUser");
    }
    toast({
      title: "Logged Out",
      description: "You have been logged out successfully.",
    });
    router.push("/"); 
  };

  const onSubmitNotification = async (values: SendNotificationSchemaType) => {
    setIsSendingNotification(true);
    if (values.sendToAll) {
      if (fetchedMembersForSelect.length === 0) {
        toast({
          variant: "destructive",
          title: "No Members to Notify",
          description: "There are no members in the list to send notifications to.",
        });
        setIsSendingNotification(false);
        return;
      }
      toast({
        title: "Sending Notifications...",
        description: `Sending message to all ${fetchedMembersForSelect.length} members. This may take a moment.`,
      });
      let successCount = 0;
      let failCount = 0;
      const promises = fetchedMembersForSelect.map(member => 
        sendNotificationToMember(member.newRegistrationId, values.message)
          .then(res => { if(res.success) successCount++; else failCount++; return res; })
          .catch(() => { failCount++; return {success: false, message: "Unknown error"}; })
      );
      
      try {
        await Promise.all(promises);
        if (failCount > 0) {
          toast({
            variant: "destructive",
            title: "Bulk Send Partially Failed",
            description: `${successCount} notifications sent successfully. ${failCount} failed. Check server logs for details.`,
          });
        } else {
          toast({
            title: "Notifications Sent",
            description: `Successfully sent notifications to all ${successCount} members.`,
          });
        }
      } catch (error) {
         toast({
            variant: "destructive",
            title: "Bulk Send Error",
            description: "An error occurred during bulk notification sending.",
          });
      }

      notificationForm.reset({ message: "", sendToAll: false, targetMemberId: "" });

    } else if (values.targetMemberId) {
      const result = await sendNotificationToMember(values.targetMemberId, values.message);
      if (result.success) {
        toast({
          title: "Notification Sent",
          description: result.message,
        });
        notificationForm.reset({ message: "", sendToAll: false, targetMemberId: "" });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Send Notification",
          description: result.message,
        });
      }
    }
    setIsSendingNotification(false);
  };

  const handleToggleProfileUpdatePermission = async (memberId: string, currentStatus: boolean) => {
    const result = await toggleProfileUpdatePermission(memberId, !currentStatus);
    if (result.success) {
      toast({
        title: "Permission Updated",
        description: result.message,
      });
      triggerRefetchMembers(); 
    } else {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: result.message,
      });
    }
  };

  const handleGlobalConfirmPayment = () => {
    router.push('/admin/payments/manage');
  };

  const handleShowMemberIdForReminder = (reminder: (RegistrationIdReminderRequest & { reminderId: string; matchedMemberId?: string; memberName?: string; matchedMemberName?: string; })) => {
    const memberIdToShow = reminder.matchedMemberId || (reminder as any).memberId; 

    if (reminder.identifierType === 'phone' && memberIdToShow) {
      const memberName = reminder.matchedMemberName || (reminder as any).memberName || "N/A";
      alert(`The Registration ID for the member associated with phone number ${reminder.identifier} is: ${memberIdToShow}\nMember Name: ${memberName}`);
    } else if (reminder.identifierType === 'email' && memberIdToShow) {
      const memberName = reminder.matchedMemberName || (reminder as any).memberName || "N/A";
      alert(`The Registration ID for the member associated with email ${reminder.identifier} is: ${memberIdToShow}\nMember Name: ${memberName}`);
    } else if (memberIdToShow) {
      alert(`Matched Member ID: ${memberIdToShow}`);
    } 
    else {
      alert(`No specific member ID was directly matched for this ${reminder.identifierType} reminder in the request. Please use the identifier to search manually if needed.`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 p-4 sm:p-6 md:p-8">
      <header className="w-full max-w-7xl mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
      </header>
          {/* User Management Card - Always Visible */}
          <Card className="shadow-lg w-full max-w-7xl mb-6">
            <CardHeader>
              <CardTitle className="text-2xl">User Management</CardTitle>
              <CardDescription>
                Manage user accounts and system settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col space-y-4">
              <Button asChild size="lg" className="w-full sm:w-auto self-start">
                <Link href="/admin/users/create">
                  <UserPlus className="mr-2 h-5 w-5" /> Create New Member
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Pending Payment Confirmations Card - Collapsible */}
          <Card className="shadow-lg w-full max-w-7xl mb-6">
            <Collapsible open={openCardSections.payments} onOpenChange={() => toggleCardSection('payments')}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                 <div className="flex justify-between items-center w-full">
                    <div>
                      <CardTitle className="text-2xl flex items-center">
                        <IndianRupee className="mr-3 h-6 w-6 text-primary" />
                        Pending Payment Confirmations ({paymentConfirmations.length})
                      </CardTitle>
                      <CardDescription>
                        Review and act on member payment notifications. Click to {openCardSections.payments ? 'collapse' : 'expand'}.
                      </CardDescription>
                    </div>
                    {openCardSections.payments ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {isLoadingPayments ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                      <p className="text-lg font-semibold text-muted-foreground">Loading Payment Confirmations...</p>
                    </div>
                  ) : fetchPaymentsError ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
                      <p className="text-lg font-semibold text-destructive">Error Loading Payments</p>
                      <p className="text-sm text-muted-foreground">{fetchPaymentsError}</p>
                    </div>
                  ) : paymentConfirmations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-semibold text-muted-foreground">No Pending Payment Confirmations</p>
                      <p className="text-sm text-muted-foreground">
                        All payment notifications have been processed.
                      </p>
                    </div>
                  ) : (
                 <div className="overflow-x-auto pt-4">
                      <Table>
                         <TableHeader>
                          <TableRow>
                            <TableHead>Member Name</TableHead>
                            <TableHead>Reg. ID</TableHead>
                            <TableHead>Amount (RS)</TableHead>
                            <TableHead>Payment Date</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                         <TableBody>
                          {paymentConfirmations.map((req) => (
                            <TableRow key={req.confirmationId}>
                              <TableCell className="whitespace-nowrap">{req.memberName || 'N/A'}</TableCell>
                              <TableCell><Badge variant="secondary">{req.memberId || 'N/A'}</Badge></TableCell>
                              <TableCell>{req.amount ?? 'N/A'}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {req.paymentDate && req.paymentDate instanceof Date && !isNaN(req.paymentDate.getTime())
                                  ? format(req.paymentDate, "PPp")
                                  : 'N/A'}
                              </TableCell>
                               <TableCell className="text-center">
                                 <div className="flex flex-col space-y-1 sm:flex-row sm:space-y-0 sm:space-x-1 items-center justify-center">
                                  <Button variant="default" size="sm" onClick={() => { if (req.confirmationId) handleConfirmPayment(req.confirmationId); }} title="Confirm Payment" className="w-full sm:w-auto">
                                     <CheckCircle className="mr-1 h-3 w-3" />Confirm
                                 </Button>
                                  <Button variant="destructive" size="sm" onClick={() => { if (req.confirmationId) handleRejectPayment(req.confirmationId); }} title="Reject Payment" className="w-full sm:w-auto">
                                     <XCircle className="mr-1 h-3 w-3" />Reject
                                 </Button>
                                 </div>
                               </TableCell>
                             </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Pending Profile Update Requests Card - Collapsible */}
          <Card className="shadow-lg w-full max-w-7xl mb-6">
            <Collapsible open={openCardSections.requests} onOpenChange={() => toggleCardSection('requests')}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-center w-full">
                    <div>
                      <CardTitle className="text-2xl flex items-center">
                        <MessageSquareWarning className="mr-3 h-6 w-6 text-primary" />
                        Pending Profile Update Requests ({changeRequests.length})
                      </CardTitle>
                      <CardDescription>
                        Review and act on member profile update requests. Click to {openCardSections.requests ? 'collapse' : 'expand'}.
                      </CardDescription>
                    </div>
                    {openCardSections.requests ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {isLoadingRequests ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                      <p className="text-lg font-semibold text-muted-foreground">Loading Requests...</p>
                    </div>
                  ) : fetchRequestsError ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
                      <p className="text-lg font-semibold text-destructive">Error Loading Requests</p>
                      <p className="text-sm text-muted-foreground">{fetchRequestsError}</p>
                    </div>
                  ) : changeRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-semibold text-muted-foreground">No Pending Requests</p>
                      <p className="text-sm text-muted-foreground">
                        All profile update requests have been processed.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Member Name</TableHead>
                            <TableHead>Reg. ID</TableHead>
                            <TableHead>Field</TableHead>
                            <TableHead>Current</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changeRequests.map((req) => {
                            const requestDate = req.requestDate instanceof Date ? req.requestDate : new Date(req.requestDate || Date.now());
                            return (
                              <TableRow key={req.requestId}>
                                <TableCell className="whitespace-nowrap">{req.memberName}</TableCell>
                                <TableCell><Badge variant="secondary">{req.memberId}</Badge></TableCell>
                                <TableCell className="whitespace-nowrap">{req.fieldName}</TableCell>
                                <TableCell className="text-xs text-muted-foreground line-through">{req.currentValue || 'N/A'}</TableCell>
                                <TableCell className="font-semibold">{req.requestedValue}</TableCell>
                                <TableCell className="whitespace-nowrap">{format(requestDate, "PPp")}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex flex-col space-y-1 sm:flex-row sm:space-y-0 sm:space-x-1 items-center justify-center">
                                    <Button variant="outline" size="sm" onClick={() => handleEditMemberForRequest(req.memberId)} title="Edit Member to Apply Change" className="w-full sm:w-auto">
                                      <Edit className="mr-1 h-3 w-3" /> Apply
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { if (req.requestId) handleDismissRequest(req.requestId) }} title="Dismiss Request" className="text-destructive hover:text-destructive/90 w-full sm:w-auto">
                                      <XSquare className="mr-1 h-3 w-3" /> Dismiss
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
          
           {/* Forgot Registration ID Requests Card - Collapsible */}
          <Card className="shadow-lg w-full max-w-7xl mb-6">
            <Collapsible open={openCardSections.regIdReminders} onOpenChange={() => toggleCardSection('regIdReminders')}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-center w-full">
                    <div>
                      <CardTitle className="text-2xl flex items-center">
                        <Users className="mr-3 h-6 w-6 text-primary" /> 
                        Forgot Registration ID Requests ({registrationIdReminders.length})
                      </CardTitle>
                      <CardDescription>
                        Review and act on member requests for forgotten Registration IDs. Click to {openCardSections.regIdReminders ? 'collapse' : 'expand'}.
                      </CardDescription>
                    </div>
                    {openCardSections.regIdReminders ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {isLoadingRegIdReminders ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                      <p className="text-lg font-semibold text-muted-foreground">Loading Reminders...</p>
                    </div>
                  ) : fetchRegIdRemindersError ? (
                     <div className="flex flex-col items-center justify-center py-12 text-center">
                      <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
                      <p className="text-lg font-semibold text-destructive">Error Loading Reminders</p>
                      <p className="text-sm text-muted-foreground">{fetchRegIdRemindersError}</p>
                    </div>
                  ) : registrationIdReminders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-semibold text-muted-foreground">No Pending Reminders</p>
                      <p className="text-sm text-muted-foreground">
                        All Registration ID reminder requests have been processed.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Identifier Type</TableHead>
                            <TableHead>Identifier (Email/Phone)</TableHead>
                            <TableHead>Matched Member</TableHead> 
                            <TableHead>Request Date</TableHead>
                            <TableHead className="text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {registrationIdReminders.map((req) => (
                            <TableRow key={req.reminderId}>
                              <TableCell className="whitespace-nowrap">{req.identifierType}</TableCell>
                              <TableCell 
                                className="whitespace-nowrap font-medium cursor-pointer hover:underline text-primary"
                                onClick={() => handleShowMemberIdForReminder(req)}
                                title={req.identifierType === 'phone' || req.identifierType === 'email' ? `Click to see matched Reg. ID for ${req.identifier}` : req.identifier}
                              >
                                {req.identifier}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {(req.matchedMemberName && req.matchedMemberName !== "N/A") ? (
                                  <>{req.matchedMemberName} <Badge variant="outline">{req.matchedMemberId || (req as any).memberId || 'N/A'}</Badge></>
                                ) : ((req as any).memberId) ? (
                                  <Badge variant="outline">{(req as any).memberId}</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No direct match</span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {req.requestDate && req.requestDate instanceof Date && !isNaN(req.requestDate.getTime())
                                  ? format(req.requestDate, "PPp")
                                  : 'N/A'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button variant="outline" size="sm" onClick={() => { if (req.reminderId) handleResolveRegIdReminder(req.reminderId); }} title="Mark as Resolved">
                                  <CheckSquare className="mr-1 h-3 w-3" /> Mark Resolved
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>


          {/* Registered Members Table - Collapsible */}
          <Card className="shadow-lg w-full max-w-7xl mb-6">
            <Collapsible open={openCardSections.members} onOpenChange={() => toggleCardSection('members')}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-center w-full">
                    <div>
                      <CardTitle className="text-2xl flex items-center">
                        <Users className="mr-3 h-6 w-6 text-primary" />
                        Registered Members ({members.length})
                      </CardTitle>
                      <CardDescription>
                        View all currently registered members. Click to {openCardSections.members ? 'collapse' : 'expand'}.
                      </CardDescription>
                    </div>
                    {openCardSections.members ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <RegisteredMembersTable
                  members={members}
                  isLoadingMembers={isLoadingMembers}
                  fetchMembersError={fetchMembersError}
                  getMembershipStatus={getMembershipStatus}
                  paymentConfirmations={paymentConfirmations} 
                  handleEdit={handleEdit}
                  handleDeleteInitiate={handleDeleteInitiate}
                  handleToggleProfileUpdatePermission={handleToggleProfileUpdatePermission}
                  handleConfirmPayment={handleConfirmPayment} 
                  handleRejectPayment={handleRejectPayment}   
                  triggerRefetchMembers={triggerRefetchMembers}
                  openCollapsibles={openCollapsibles}
                  toggleCollapsible={toggleCollapsible}
                />
              </CollapsibleContent>
            </Collapsible>
          </Card>

      <div className="mt-8 w-full max-w-7xl bg-gray-900 text-white p-4 rounded-lg shadow-xl">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0 md:max-w-md">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="send-notification" className="border-b-0">
                <AccordionTrigger className="text-sm font-medium hover:bg-gray-700/50 rounded-md p-3 flex items-center justify-between w-full text-white [&>svg]:text-white [&[data-state=open]>svg]:text-white">
                  <div className="flex items-center font-bold">
                    <Bell className="mr-2 h-4 w-4" />
                    Send Notification
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-3 pt-4 bg-gray-800 text-white rounded-b-md">
                    <Form {...notificationForm}>
                      <form onSubmit={notificationForm.handleSubmit(onSubmitNotification)} className="space-y-3">
                        <FormField
                          control={notificationForm.control}
                          name="sendToAll"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  id="sendToAllCheckbox"
                                  className="border-gray-600 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                              </FormControl>
                              <FormLabel htmlFor="sendToAllCheckbox" className="text-xs text-gray-300 cursor-pointer">
                                Send to All Members
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={notificationForm.control}
                          name="targetMemberId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs text-gray-300">Select Member (if not sending to all)</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                value={field.value || ""}
                                disabled={watchSendToAll}
                              >
                                <FormControl>
                                  <SelectTrigger 
                                    className={cn(
                                      "bg-gray-700 border-gray-600 text-white h-9 text-xs focus:ring-primary focus:border-primary",
                                      watchSendToAll && "opacity-50 cursor-not-allowed"
                                    )}
                                  >
                                    <SelectValue placeholder="Choose a member..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-gray-800 text-white border-gray-600">
                                  {fetchedMembersForSelect.map(member => (
                                    <SelectItem key={member.newRegistrationId} value={member.newRegistrationId} className="text-xs hover:!bg-gray-700 hover:!text-white">
                                      {member.userName} ({member.newRegistrationId})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-xs text-red-400" />
                            </FormItem>
                          )} />
                        <FormField
                          control={notificationForm.control}
                          name="message"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs text-gray-300">Message</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Enter your notification message..."
                                  {...field}
                                  className="bg-gray-700 border-gray-600 text-white text-xs placeholder:text-gray-400 min-h-[80px] focus:ring-primary focus:border-primary" />
                              </FormControl>
                              <FormMessage className="text-xs text-red-400" />
                            </FormItem>
                          )} />
                        <Button type="submit" disabled={isSendingNotification} className="w-full h-9 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
                          {isSendingNotification ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <SendHorizontal className="mr-2 h-3 w-3" />
                          )}
                          Send
                        </Button>
                      </form>
                    </Form>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <div className="flex-shrink-0 pt-2 md:pt-0 md:pl-4 flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <Button 
              variant="ghost" 
              className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto" 
              onClick={handleGlobalConfirmPayment}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Manage Payments
            </Button>
             <Button asChild variant="ghost" className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto">
              <Link href="/forum?from=admin_dashboard">
                <MessageSquare className="mr-2 h-4 w-4" /> Community Forum
              </Link>
            </Button>
            <Button variant="ghost" className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the member 
              <span className="font-semibold"> {memberPendingDeletion?.name} (ID: {memberPendingDeletion?.id})</span> and remove their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberPendingDeletion(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
 );
 
}
