
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteId } from "@/hooks/use-route-id";
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2, UserCog, LogOut, Save, FileText, CreditCard } from "lucide-react"; // Added CreditCard
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateMemberFormFields } from "@/components/admin/create-user-form"; 
import { UserPhotoUploadField } from "@/components/admin/user-photo-upload-field"; 
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from "@/components/ui/sidebar";
import { getMemberByIdFromDb, updateMemberInDb } from "@/actions/member-actions"; 
import { formSchema, type FormSchemaType } from "@/lib/schemas/member-schema"; 
import { useMembers } from "@/context/MemberContext"; 

export default function EditMemberPage() {
  const { toast } = useToast();
  const router = useRouter();
  const memberId = useRouteId(); // This is the original/current registration ID

  const { triggerRefetchMembers } = useMembers();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState<string | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  
  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    // Default values will be set after fetching member data
  });

  React.useEffect(() => {
    if (memberId) {
      const fetchMemberData = async () => {
        setIsLoadingData(true);
        setFetchError(null);
        const result = await getMemberByIdFromDb(memberId);
        if (result.success && result.member) {
          // Convert date strings back to Date objects if necessary
          // Ensure date fields are Date or undefined, not null
          const memberData = {
            ...result.member,
            startDate: result.member.startDate ? new Date(result.member.startDate) : undefined,
            pauseDates: result.member.pauseDates?.map(d => new Date(d)) || [],
            dateOfBirth: result.member.dateOfBirth ? new Date(result.member.dateOfBirth) : undefined,
            endDate: result.member.endDate ? new Date(result.member.endDate) : undefined,
          };
          form.reset(memberData); // Pre-fill the form with fetched data
        } else {
          setFetchError(result.message || "Failed to fetch member details.");
          toast({
            variant: "destructive",
            title: "Error Fetching Member",
            description: result.message || "Could not load member data for editing.",
          });
        }
        setIsLoadingData(false);
      };
      fetchMemberData();
    }
  }, [memberId, form, toast]);
  

  async function onSubmit(values: FormSchemaType) {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    console.log("Attempting to update member with ID:", memberId, "and values:", values);
    // Pass memberId as currentRegistrationId to the server action
    const result = await updateMemberInDb(memberId, values);
    console.log("Server action (updateMemberInDb) result:", result);

    if (result.success && result.member) {
      setSubmitSuccess(`Member "${result.member.userName}" (ID: ${result.member.newRegistrationId}) updated successfully!`);
      toast({
        title: "Member Update Succeeded",
        description: `Member ${result.member.userName} updated.`,
      });
      triggerRefetchMembers(); 
      router.push("/admin/dashboard");
    } else {
      setSubmitError(result.message || "An unknown error occurred while updating the member.");
      toast({
        variant: "destructive",
        title: "Member Update Failed",
        description: result.message,
      });
      // If the error is due to Registration ID conflict, reflect it in the form
      if (result.message && result.message.toLowerCase().includes("registration id")) {
        form.setError("newRegistrationId", {
          type: "manual",
          message: result.message,
        });
      }
    }
    
    setIsSubmitting(false);
  }

  const handleLogout = () => {
    toast({
      title: "Logged Out",
      description: "You have been logged out successfully.",
    });
    router.push("/"); 
  };

  const handleConfirmPayment = () => {
    console.log("Confirm Payment clicked from page!");
    // Implement your actual payment confirmation logic here
    toast({
      title: "Payment Confirmation",
      description: "Payment confirmation process initiated (placeholder).",
    });
  };

  if (isLoadingData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading member data...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Member</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
        <Button asChild className="mt-4">
          <Link href="/admin/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }


  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-muted/40">
        <Sidebar className="border-r">
          <SidebarContent>
            <SidebarMenu className="pt-8">
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="justify-start font-bold">
                  <Link href="/admin/dashboard">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Dashboard
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="justify-start font-bold" onClick={handleConfirmPayment}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Confirm Payment
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="justify-start font-bold" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="justify-start font-bold">
                  <Link href="#">
                    <FileText className="mr-2 h-4 w-4" />
                    Schedule/Diet
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            {/* Optional: content for sidebar footer */}
          </SidebarFooter>
        </Sidebar>
        
        <main className="flex-1 flex flex-col items-center p-2 sm:p-4 md:p-6 overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-xl">
              <Card className="w-full shadow-lg">
                <CardHeader className="flex flex-row justify-between items-start p-6">
                  <div className="flex-1">
                    <CardTitle className="text-2xl">Edit Member</CardTitle>
                    <CardDescription>
                      Modify the details below for member ID: {memberId}.
                    </CardDescription>
                  </div>
                  <UserPhotoUploadField control={form.control} setValue={form.setValue} />
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  {submitError && (
                    <Alert variant="destructive" className="mb-6">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error Updating Member</AlertTitle>
                      <AlertDescription>{submitError}</AlertDescription>
                    </Alert>
                  )}
                  {submitSuccess && (
                    <Alert variant="default" className="mb-6 border-green-500 bg-green-50 dark:bg-green-900/30">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <AlertTitle className="text-green-700 dark:text-green-300">Success</AlertTitle>
                      <AlertDescription className="text-green-600 dark:text-green-400">
                        {submitSuccess}
                      </AlertDescription>
                    </Alert>
                  )}
                  {/* Pass memberId as originalRegistrationId here */}
                  <CreateMemberFormFields form={form} originalRegistrationId={memberId} />
                  <Button type="submit" disabled={isSubmitting || isLoadingData} className="w-full mt-6">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating Member...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" /> 
                        Save Changes
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </form>
          </Form>
        </main>
      </div>
    </SidebarProvider>
  );
}

