
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2, UserPlus, LogOut, FileText } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateMemberFormFields } from "@/components/admin/create-user-form";
import { UserPhotoUploadField } from "@/components/admin/user-photo-upload-field";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { addMemberToDb } from "@/actions/member-actions"; 
import type { StoredMember } from "@/lib/types/member-types";
import { formSchema, type FormSchemaType } from "@/lib/schemas/member-schema"; 
import { useMembers } from "@/context/MemberContext"; 

export default function CreateMemberPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { triggerRefetchMembers, triggerRefetchPayments } = useMembers(); 
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = React.useState<string | null>(null);

  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userPhoto: "",
      newRegistrationId: "",
      userName: "",
      userEmail: "",
      userPhoneNumber: "",
      userPlan: undefined,
      startDate: undefined,
      customPlanDuration: "",
      customPlanPrice: "",
      pauseDates: [],
      endDate: undefined, 
      dateOfBirth: undefined,
    },
  });
  

  async function onSubmit(values: FormSchemaType) {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    console.log("CreateMemberPage: Attempting to create member with values:", values);
    const result = await addMemberToDb(values);
    console.log("CreateMemberPage: Server action (addMemberToDb) result:", result);

    if (result.success && result.memberId) {
      
      let successMessage = `Member "${values.userName}" (ID: ${values.newRegistrationId}) creation process initiated!`;
      let toastDescription = `Status: ${result.message}. Member: ${values.userName}, ID: ${result.memberId}.`;
      
      setSubmitSuccess(successMessage);
      
      toast({
        title: "Member Creation Succeeded",
        description: toastDescription,
      });
      
      console.log("CreateMemberPage: New member data sent to server action:", values);
      triggerRefetchMembers(); 
      triggerRefetchPayments(); // Trigger refetch for payment confirmations
      router.push("/admin/dashboard");

    } else {
      setSubmitError(result.message || "An unknown error occurred while creating the member.");
      toast({
        variant: "destructive",
        title: "Member Creation Failed",
        description: result.message,
      });
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


  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 p-2 sm:p-4 md:p-6">
        <main className="w-full max-w-xl mb-8"> 
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Card className="w-full shadow-lg">
                <CardHeader className="flex flex-row justify-between items-start p-6">
                  <div className="flex-1">
                    <CardTitle className="text-2xl">Create Member</CardTitle>
                    <CardDescription>
                      Fill in the details below to register a new member.
                    </CardDescription>
                  </div>
                  <UserPhotoUploadField control={form.control} setValue={form.setValue} />
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  {submitError && (
                    <Alert variant="destructive" className="mb-6">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error Creating Member</AlertTitle>
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
                  <CreateMemberFormFields form={form} />
                  <Button type="submit" disabled={isSubmitting} className="w-full mt-6">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Member...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create Member
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </form>
          </Form>
        </main>

      <div className="w-full max-w-xl bg-gray-900 text-white p-4 rounded-lg shadow-xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <Button asChild variant="ghost" className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm">
            <Link href="/admin/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          <Button asChild variant="ghost" className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm">
            <Link href="#">
              <FileText className="mr-2 h-4 w-4" />
              Schedule/Diet
            </Link>
          </Button>
          <Button variant="ghost" className="justify-start font-bold text-white hover:bg-gray-700/50 hover:text-white w-full sm:w-auto text-sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
