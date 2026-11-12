
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, FileText, CreditCard, ArrowLeft, QrCode, IndianRupee, Smartphone, Mail, Loader2, ShieldAlert } from "lucide-react"; 

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requestPaymentConfirmation, getMemberByIdFromDb } from "@/actions/member-actions"; 
import type { StoredMember } from "@/lib/types/member-types";
import { cn } from "@/lib/utils";

const ALT_PHONE_NUMBER = "8950282346";
const ALT_UPI_ID = "armwrestlingclub@okicici";
const PAYMENT_AMOUNT = 700; 

export default function MemberPaymentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [member, setMember] = React.useState<StoredMember | null>(null);
  const [isLoadingMember, setIsLoadingMember] = React.useState(true);
  const [memberError, setMemberError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const registrationId = typeof window !== "undefined" ? localStorage.getItem("loggedInMemberId") : null;

  React.useEffect(() => {
    async function fetchMember() {
      if (!registrationId) {
        setMemberError("No member ID found. Please log in again.");
        setIsLoadingMember(false);
        // Consider redirecting if no ID, e.g., router.push("/");
        return;
      }
      setIsLoadingMember(true);
      const result = await getMemberByIdFromDb(registrationId);
      if (result.success && result.member) {
        setMember(result.member);
      } else {
        setMemberError(result.message || "Could not fetch your details.");
      }
      setIsLoadingMember(false);
    }
    fetchMember();
  }, [registrationId, router]);

  const handleLogout = () => {
    localStorage.removeItem("loggedInMemberId");
    localStorage.removeItem("forumLoggedInRegistrationId");
    localStorage.removeItem("forumUserDisplayName");
    localStorage.removeItem("isAdminUser");
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    router.push("/");
  };

  const handleBackToDetails = () => {
    if (registrationId) {
        router.push(`/member/${registrationId}`);
    } else {
        router.push("/"); 
    }
  };

  const handlePaymentNotification = async () => {
    if (!member) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Member details not loaded. Cannot proceed.",
      });
      return;
    }
    setIsSubmitting(true);
    const result = await requestPaymentConfirmation(member.newRegistrationId, PAYMENT_AMOUNT);
    if (result.success) {
      toast({
        title: "Payment Notified",
        description: result.message,
        duration: 5000,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Notification Failed",
        description: result.message || "Could not notify admin of payment.",
      });
    }
    setIsSubmitting(false);
  };

  if (isLoadingMember) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading your details...</p>
      </div>
    );
  }

  if (memberError && !member) { 
     return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-muted/40">
        <Alert variant="destructive" className="max-w-md">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{memberError}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push("/")} className="mt-6">
          Go to Login
        </Button>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-muted/40 p-4 sm:p-6 md:p-8">
      <main className="flex-1 flex flex-col items-center justify-center w-full py-8">
        <div className="w-full max-w-md">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-primary">Make a Payment</h1>
            <p className="text-muted-foreground">Complete your membership payment securely.</p>
          </header>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Payment Details</CardTitle>
              <CardDescription>Your current outstanding payment for {member?.userPlan || 'your plan'}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-background rounded-md border">
                <div>
                  <p className="font-medium text-foreground">Plan</p>
                  <p className="text-muted-foreground text-sm">{member?.userPlan || 'Membership Plan'}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground text-right">Amount</p>
                  <p className="text-muted-foreground text-sm text-right">{PAYMENT_AMOUNT} RS</p>
                </div>
              </div>
              
              <Separator />

              <div>
                <h3 className="mb-3 text-lg font-semibold text-center text-foreground">Pay with UPI</h3>
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-2 border rounded-md bg-white">
                     <Image 
                      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/kurukshetra_gym_qr.jpg`} 
                      alt="Kurukshetra Gym UPI QR Code for payment" 
                      width={250} 
                      height={250}
                      data-ai-hint="QR code payment"
                     />
                  </div>
                  <p className="text-sm text-muted-foreground">Scan the QR code with your UPI app.</p>
                  
                  <div className="flex items-center w-full">
                      <Separator className="flex-1" />
                      <span className="px-2 text-xs text-muted-foreground">OR</span>
                      <Separator className="flex-1" />
                  </div>

                  <div className="w-full space-y-1.5 mt-2">
                    <Label htmlFor="altPhoneNumber" className="text-sm font-medium">Pay to Phone Number</Label>
                     <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        id="altPhoneNumber" 
                        type="text" 
                        value={ALT_PHONE_NUMBER}
                        readOnly
                        className="text-center bg-muted/50 cursor-default pl-10"
                      />
                    </div>
                  </div>

                  <div className="w-full space-y-1.5 mt-2">
                    <Label htmlFor="altUpiId" className="text-sm font-medium">Or Pay to This UPI ID</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        id="altUpiId" 
                        type="text" 
                        value={ALT_UPI_ID}
                        readOnly
                        className="text-center bg-muted/50 cursor-default pl-10"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <p className="text-xs text-center text-muted-foreground">
                After completing your payment to one of the above UPI details, click the button below to notify the admin.
              </p>
              <Button className="w-full" size="lg" onClick={handlePaymentNotification} disabled={isSubmitting || isLoadingMember || !member}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <IndianRupee className="mr-2 h-5 w-5" />}
                Notify Admin of Payment
              </Button>
            </CardFooter>
          </Card>
           <p className="mt-6 text-xs text-center text-muted-foreground">
              This system simulates payment notification. Admin will verify and update your account.
          </p>
        </div>
      </main>

      <footer className="w-full max-w-4xl mt-8 p-4 border-t bg-gray-900 text-white rounded-t-lg">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-3">
          <Button 
            variant="ghost" 
            className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm" 
            onClick={handleBackToDetails}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to My Details
          </Button>
          <Button 
            asChild 
            variant="ghost" 
            className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm"
          >
            <Link href="/member/services">
              <FileText className="mr-2 h-4 w-4" />
              Schedule/Diet
            </Link>
          </Button>
          <Button 
            variant="ghost" 
            className={cn(
              "justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm",
              "opacity-70 cursor-not-allowed" // Visually indicate it's the current page
            )}
            disabled={true} 
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Pay your dues (Current Page)
          </Button>
          <Button 
            variant="ghost" 
            className="justify-start font-bold text-red-400 hover:bg-gray-700/50 hover:text-red-300 w-full sm:w-auto text-sm" 
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </footer>
    </div>
  );
}
