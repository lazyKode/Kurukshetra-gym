
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2, UserPlus, LogIn } from "lucide-react"; // Added LogIn
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
// Removed: import { useMembers } from "@/context/MemberContext"; 

export default function PublicRegisterPage() { // Changed component name
  const { toast } = useToast();
  const router = useRouter();
  // Removed: const { triggerRefetchMembers, triggerRefetchPayments } = useMembers(); 
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

    console.log("PublicRegisterPage: Attempting to register member with values:", values);
    const result = await addMemberToDb(values);
    console.log("PublicRegisterPage: Server action (addMemberToDb) result:", result);

    if (result.success && result.memberId) {
      
      let successMessage = `Registration successful for "${values.userName}" (ID: ${values.newRegistrationId})!`; // Modified message
      let toastDescription = `Status: ${result.message}. Welcome, ${values.userName}! Your ID is ${result.memberId}.`; // Modified message
      
      setSubmitSuccess(successMessage);
      
      toast({
        title: "Registration Successful", // Modified title
        description: toastDescription,
      });
      
      console.log("PublicRegisterPage: New member data sent to server action:", values);
      // Removed: triggerRefetchMembers(); 
      // Removed: triggerRefetchPayments(); 
      router.push(`/member/${result.memberId}`); // Redirect to the new member's page

    } else {
      setSubmitError(result.message || "An unknown error occurred during registration."); // Modified message
      toast({
        variant: "destructive",
        title: "Registration Failed", // Modified title
        description: result.message,
      });
    }
    
    setIsSubmitting(false);
  }

  // Removed: handleLogout function

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-2 sm:p-4 md:p-6">
        <main className="w-full max-w-xl mb-8"> 
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Card className="w-full shadow-lg">
                <CardHeader className="flex flex-row justify-between items-start p-6">
                  <div className="flex-1">
                    <CardTitle className="text-2xl">Register New Account</CardTitle> {/* Modified title */}
                    <CardDescription>
                      Fill in the details below to create your account.
                    </CardDescription> {/* Modified description */}
                  </div>
                  <UserPhotoUploadField control={form.control} setValue={form.setValue} />
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  {submitError && (
                    <Alert variant="destructive" className="mb-6">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error Registering</AlertTitle> {/* Modified title */}
                      <AlertDescription>{submitError}</AlertDescription>
                    </Alert>
                  )}
                  {submitSuccess && (
                    <Alert variant="default" className="mb-6 border-green-500 bg-green-50 dark:bg-green-900/30">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <AlertTitle className="text-green-700 dark:text-green-300">Registration Complete</AlertTitle> {/* Modified title */}
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
                        Registering...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Register Account
                      </>
                    )} {/* Modified button text */}
                  </Button>
                </CardContent>
              </Card>
            </form>
          </Form>
        </main>

      {/* Modified bottom section */}
      <div className="w-full max-w-xl text-center">
        <Link href="/" className="text-sm text-primary hover:underline">
          <LogIn className="mr-1 h-4 w-4 inline-block" /> Already have an account? Login
        </Link>
      </div>
    </div>
  );
}
