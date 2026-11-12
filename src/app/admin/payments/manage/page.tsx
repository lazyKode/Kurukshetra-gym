
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, ShieldAlert, ArrowLeft, CheckCircle, CheckSquare, XCircle, IndianRupee } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getPendingPaymentConfirmations, confirmPayment, rejectPayment } from "@/actions/member-actions";
import type { PaymentConfirmationRequest } from "@/lib/types/member-types";
import { useMembers } from "@/context/MemberContext";

export default function ManagePaymentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { triggerRefetchMembers, triggerRefetchPayments: triggerDashboardRefetchPayments } = useMembers(); // Use context refetch for dashboard

  const [pendingPayments, setPendingPayments] = React.useState<(PaymentConfirmationRequest & { confirmationId: string })[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = React.useState(0);

  const triggerLocalRefetchPayments = () => setRefetchTrigger(prev => prev + 1);

  React.useEffect(() => {
    async function fetchPayments() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getPendingPaymentConfirmations();
        if (result.success && result.requests) {
          setPendingPayments(result.requests);
        } else {
          setError(result.message || "Failed to fetch pending payments.");
          setPendingPayments([]);
        }
      } catch (err) {
        console.error("Error fetching pending payments on manage page:", err);
        setError("An unexpected error occurred while fetching payments.");
        setPendingPayments([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPayments();
  }, [refetchTrigger]);

  const handleConfirm = async (confirmationId: string) => {
    const result = await confirmPayment(confirmationId);
    if (result.success) {
      toast({
        title: "Payment Confirmed",
        description: result.message,
      });
      triggerLocalRefetchPayments(); // Refetch for this page
      triggerDashboardRefetchPayments(); // Refetch for the dashboard
      triggerRefetchMembers(); // Also refetch members as their status might change
    } else {
      toast({
        variant: "destructive",
        title: "Payment Confirmation Failed",
        description: result.message,
      });
    }
  };

  const handleReject = async (confirmationId: string) => {
    const result = await rejectPayment(confirmationId);
    if (result.success) {
      toast({
        title: "Payment Rejected",
        description: result.message,
      });
      triggerLocalRefetchPayments(); // Refetch for this page
      triggerDashboardRefetchPayments(); // Refetch for the dashboard
      triggerRefetchMembers(); // Also refetch members as their status might change
    } else {
      toast({
        variant: "destructive",
        title: "Payment Rejection Failed",
        description: result.message,
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <IndianRupee className="mr-3 h-8 w-8" /> Manage Pending Payments
          </h1>
          <Button asChild variant="outline">
            <Link href="/admin/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Link>
          </Button>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Pending Confirmations</CardTitle>
            <CardDescription>
              Review and act on member payment notifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                <p className="text-lg font-semibold text-muted-foreground">Loading Payments...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
                <p className="text-lg font-semibold text-destructive">Error Loading Payments</p>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button onClick={triggerLocalRefetchPayments} className="mt-4">Try Again</Button>
              </div>
            ) : pendingPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-semibold text-muted-foreground">No Pending Payments</p>
                <p className="text-sm text-muted-foreground">
                  All payment notifications have been processed.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                    {pendingPayments.map((req) => (
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
                            <Button variant="default" size="sm" onClick={() => { if (req.confirmationId) handleConfirm(req.confirmationId); }} title="Confirm Payment" className="w-full sm:w-auto">
                              <CheckCircle className="mr-1 h-3 w-3" />Confirm
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => { if (req.confirmationId) handleReject(req.confirmationId); }} title="Reject Payment" className="w-full sm:w-auto">
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
        </Card>
      </div>
    </div>
  );
}

    