
"use client";

import * as React from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Users, ImageOff, ShieldAlert, ChevronDown, ChevronUp, Loader2, Pencil, Trash2, Edit, ShieldCheck, ShieldOff, IndianRupee, CheckCircle, XCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { StoredMember, PaymentConfirmationRequest, AccountStatus } from "@/lib/types/member-types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateMemberAccountStatus } from "@/actions/member-actions";
import { useToast } from "@/hooks/use-toast";

// Helper type guard to check for Firestore Timestamp
function isTimestamp(date: any): date is { toDate: () => Date } {
  return date && typeof date.toDate === 'function';
}

interface RegisteredMembersTableProps {
  members: StoredMember[];
  isLoadingMembers: boolean;
  fetchMembersError: string | null;
  getMembershipStatus: (member: StoredMember) => { text: string; badgeVariant: "default" | "secondary" | "destructive" | "outline"; rowClass: string; endDateFormatted: string };
  paymentConfirmations: (PaymentConfirmationRequest & { confirmationId: string })[];
  handleEdit: (memberId: string) => void;
  handleDeleteInitiate: (memberId: string, memberName: string) => void;
  handleToggleProfileUpdatePermission: (memberId: string, currentStatus: boolean) => void;
  handleConfirmPayment: (confirmationId: string) => void;
  handleRejectPayment: (confirmationId: string) => void;
  triggerRefetchMembers: () => void;
  openCollapsibles: Record<string, boolean>;
  toggleCollapsible: (id: string) => void;
}

export function RegisteredMembersTable({
  members,
  isLoadingMembers,
  fetchMembersError,
  getMembershipStatus,
  paymentConfirmations,
  handleEdit,
  handleDeleteInitiate,
  handleToggleProfileUpdatePermission,
  handleConfirmPayment,
  handleRejectPayment,
  triggerRefetchMembers,
  openCollapsibles,
  toggleCollapsible,
}: RegisteredMembersTableProps) {

  const { toast } = useToast();
  const [selectedStatusMap, setSelectedStatusMap] = React.useState<Record<string, AccountStatus | undefined>>({});
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState<Record<string, boolean>>({});

  const allAccountStatuses: AccountStatus[] = ['pending_initial_payment', 'active', 'inactive_payment_rejected', 'membership_expired', 'paused'];

  const getStatusDisplayString = (status: AccountStatus): string => {
    if (status === 'pending_initial_payment') {
      return "Pending Payment";
    }
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleStatusChange = (memberId: string, newStatus: AccountStatus) => {
    setSelectedStatusMap(prev => ({ ...prev, [memberId]: newStatus }));
  };

  const handleSaveStatus = async (memberId: string, currentMember: StoredMember) => {
    const newStatus = selectedStatusMap[memberId];
    if (!newStatus) {
      toast({ title: "No Status Selected", description: "Please select a new status to save.", variant: "default" });
      return;
    }

    if (newStatus === currentMember.accountStatus) {
        toast({ title: "No Change", description: "The selected status is the same as the current status.", variant: "default" });
        return;
    }

    setIsUpdatingStatus(prev => ({...prev, [memberId]: true}));
    const result = await updateMemberAccountStatus(memberId, newStatus);

    if (result.success) {
      toast({
        title: "Status Updated",
        description: `Status for ${currentMember.userName} updated to ${getStatusDisplayString(newStatus)}.`,
      });
      triggerRefetchMembers();
      setSelectedStatusMap(prev => ({ ...prev, [memberId]: undefined }));
    } else {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: result.message || "Could not update member status.",
      });
    }
    setIsUpdatingStatus(prev => ({...prev, [memberId]: false}));
  };


  if (isLoadingMembers) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
        <p className="text-xl font-semibold text-muted-foreground">Loading Members...</p>
      </div>
    );
  }

  if (fetchMembersError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <p className="text-xl font-semibold text-destructive">Error Loading Members</p>
        <p className="text-sm text-muted-foreground">{fetchMembersError}</p>
        <Button onClick={triggerRefetchMembers} className="mt-4">Try Again</Button>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-muted-foreground">No Members Registered Yet</p>
        <p className="text-sm text-muted-foreground">
          Click on "Create New Member" to add the first member.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reg. ID / Details</TableHead>
            <TableHead>Photo</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead className="text-center">Pause Days Used</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const statusInfo = getMembershipStatus(member);
            const isOpen = openCollapsibles[member.newRegistrationId] || false;
            const detailsId = `details-${member.newRegistrationId}`;
            const memberPendingPayment = paymentConfirmations.find(p => p.memberId === member.newRegistrationId && p.status === 'pending');
            const currentSelectedNewStatus = selectedStatusMap[member.newRegistrationId];
            
            return (
              <React.Fragment key={member.newRegistrationId}>
                <TableRow
                  className={cn(
                    statusInfo.rowClass,
                    "cursor-pointer hover:bg-muted/70 transition-colors",
                    isOpen && "bg-muted/70"
                  )}
                  onClick={() => toggleCollapsible(member.newRegistrationId)}
                  aria-expanded={isOpen}
                  aria-controls={detailsId}
                >
                  <TableCell className="align-top">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center p-1 text-left w-full justify-start"
                      aria-label={`Toggle details for ${member.userName}`}
                    >
                      <Badge variant="secondary" className="mr-2 whitespace-nowrap">{member.newRegistrationId}</Badge>
                      {isOpen ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
                    </Button>
                  </TableCell>
                  <TableCell className="align-top">
                    <Avatar className="h-10 w-10">
                      {member.userPhoto ? (
                        <AvatarImage src={member.userPhoto} alt={member.userName} data-ai-hint="profile avatar"/>
                      ) : (
                        <AvatarImage src="https://placehold.co/100x100.png" alt="Placeholder" data-ai-hint="profile avatar placeholder"/>
                      )}
                      <AvatarFallback>
                        <ImageOff className="h-5 w-5 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">{member.userName}</TableCell>
                  <TableCell className="align-top">
                    <Badge variant={statusInfo.badgeVariant}>
                      {statusInfo.text}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">
                    {member.userPlan}
                    {member.userPlan === "Custom Plan" && member.customPlanDuration && (
                      <span className="block text-xs text-muted-foreground">
                        ({member.customPlanDuration})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">
                    {member.startDate ? format(new Date(member.startDate), "PPP") : 'N/A'}
                  </TableCell>
                  <TableCell className="text-center align-top">
                    {member.userPlan !== "Custom Plan" && member.pauseDates?.length ? (
                      <Badge variant="outline">{member.pauseDates.length}</Badge>
                    ) : (
                      member.userPlan !== "Custom Plan" ? <Badge variant="outline">0</Badge> : 'N/A'
                    )}
                  </TableCell>
                  <TableCell className="text-center align-top">
                    <div className="flex flex-col space-y-1 sm:flex-row sm:space-y-0 sm:space-x-1 items-center justify-center">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(member.newRegistrationId);}} title="Edit Member">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteInitiate(member.newRegistrationId, member.userName);}} title="Delete Member" className="text-destructive hover:text-destructive/90">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {memberPendingPayment && (
                        <Button 
                          variant="default" 
                          size="icon" 
                          onClick={(e) => { e.stopPropagation(); if (memberPendingPayment?.confirmationId) handleConfirmPayment(memberPendingPayment.confirmationId);}} 
                          title="Confirm Payment"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow id={detailsId} className="border-0 hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0 !border-none">
                    <Collapsible open={isOpen} className="w-full">
                      <CollapsibleContent
                        className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
                      >
                        {isOpen && (
                          <div className="p-4 bg-muted/50 border-y">
                            <h4 className="text-md font-semibold mb-3 text-foreground">Full Member Details:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                              <div><strong>Reg. ID:</strong> {member.newRegistrationId}</div>
                              <div><strong>Username:</strong> {member.userName}</div>
                              <div><strong>Email:</strong> {member.userEmail || 'N/A'}</div>
                              <div><strong>Phone:</strong> {member.userPhoneNumber}</div>
                              <div><strong>Plan:</strong> {member.userPlan}</div>
                              {member.userPlan === "Custom Plan" && (
                                <>
                                  <div><strong>Custom Duration:</strong> {member.customPlanDuration || 'N/A'}</div>
                                  <div><strong>Custom Price:</strong> {member.customPlanPrice ? `${member.customPlanPrice} RS` : 'N/A'}</div>
                                </>
                              )}
                              <div><strong>Start Date:</strong> {member.startDate ? format(new Date(member.startDate), "PPP") : 'N/A'}</div>
                              <div><strong>Calculated End:</strong> {statusInfo.endDateFormatted}</div>
                              <div><strong>Current Account Status:</strong> <Badge variant={statusInfo.badgeVariant} className="text-xs">{statusInfo.text}</Badge></div>
                              {member.userPlan !== "Custom Plan" && (
                                <div className="md:col-span-1 lg:col-span-2">
                                  <strong>Pause Dates ({member.pauseDates?.length || 0}):</strong>
                                  <span className="ml-1">
                                    {member.pauseDates && member.pauseDates.length > 0
                                      ? member.pauseDates.map(date => format(new Date(date), "PPP")).join(", ")
                                      : 'No pause dates'}
                                  </span>
                                </div>
                              )}
                              <div>
                                <strong>Profile Updates Allowed:</strong>
                                <Badge variant={member.canRequestProfileUpdates ? "default" : "secondary"} className="ml-2 text-xs">
                                  {member.canRequestProfileUpdates ? "Enabled" : "Disabled"}
                                </Badge>
                              </div>
                              <div className="md:col-span-full lg:col-auto flex flex-wrap gap-2 items-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => { e.stopPropagation(); if (member.newRegistrationId) { handleToggleProfileUpdatePermission(member.newRegistrationId, member.canRequestProfileUpdates); }}}
                                  className="mt-1"
                                >
                                  {member.canRequestProfileUpdates ? <ShieldOff className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                  {member.canRequestProfileUpdates ? "Disable Requests" : "Enable Requests"}
                                </Button>
                              </div>

                              {/* Manual Status Update Section */}
                              <div className="md:col-span-full lg:col-span-2 border-t mt-3 pt-3">
                                <h5 className="text-sm font-semibold mb-1 text-primary">Manual Account Status Update:</h5>
                                <div className="flex flex-col sm:flex-row items-center gap-2">
                                  <Select
                                    value={currentSelectedNewStatus || member.accountStatus}
                                    onValueChange={(value: AccountStatus) => handleStatusChange(member.newRegistrationId, value)}
                                  >
                                    <SelectTrigger className="w-full sm:w-[220px] text-xs" onClick={(e) => e.stopPropagation()}>
                                      <SelectValue placeholder="Select new status" />
                                    </SelectTrigger>
                                    <SelectContent onClick={(e) => e.stopPropagation()}>
                                      {allAccountStatuses.map(status => (
                                        <SelectItem key={status} value={status} className="text-xs">
                                          {getStatusDisplayString(status)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); handleSaveStatus(member.newRegistrationId, member); }}
                                    disabled={isUpdatingStatus[member.newRegistrationId] || !currentSelectedNewStatus || currentSelectedNewStatus === member.accountStatus}
                                    className="w-full sm:w-auto"
                                  >
                                    {isUpdatingStatus[member.newRegistrationId] ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                                    Save Status
                                  </Button>
                                </div>
                                {currentSelectedNewStatus && currentSelectedNewStatus !== member.accountStatus && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Click 'Save Status' to apply change from '{getStatusDisplayString(member.accountStatus)}' to '{getStatusDisplayString(currentSelectedNewStatus)}'.
                                    </p>
                                )}
                              </div>

                              {memberPendingPayment && (
                                <div className="md:col-span-full border-t mt-3 pt-3">
                                  <h5 className="text-sm font-semibold mb-2 text-primary">
                                    {member.accountStatus === 'pending_initial_payment' ? 'Pending Initial Payment' : 'Pending Renewal/Other Payment'}:
                                  </h5>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                                    <div><strong>Amount:</strong> {memberPendingPayment.amount} RS</div>
                                    <div><strong>Date Requested:</strong> {
                                      memberPendingPayment.paymentDate ? 
                                        format(
                                          isTimestamp(memberPendingPayment.paymentDate) ? 
                                            memberPendingPayment.paymentDate.toDate() : 
                                            new Date(memberPendingPayment.paymentDate),
                                          "PPp"
                                        ) : 'N/A'
                                    }</div>
                                    <div className="sm:col-span-2 md:col-span-1 flex flex-col sm:flex-row sm:items-center gap-2 mt-2 sm:mt-0">
                                      <Button
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); if (memberPendingPayment?.confirmationId) handleConfirmPayment(memberPendingPayment.confirmationId); }}
                                        className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
                                        title="Confirm Payment from Details"
                                      >
                                        <CheckCircle className="mr-1 h-3 w-3" /> Confirm
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); if (memberPendingPayment?.confirmationId) handleRejectPayment(memberPendingPayment.confirmationId); }}
                                        className="w-full sm:w-auto"
                                        title="Reject Payment from Details"
                                      >
                                        <XCircle className="mr-1 h-3 w-3" /> Reject
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

