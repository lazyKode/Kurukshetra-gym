
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { KeyRound, Badge as RegistrationBadgeIcon, Loader2, AlertTriangle, MessageSquare } from "lucide-react"; // Added MessageSquare

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { verifyMemberRegistrationId } from "@/actions/member-actions";
import { ForgotIdDialog } from "./forgot-id-dialog"; 
import { cn } from "@/lib/utils"; 

const formSchema = z.object({
  registrationId: z.string().min(3, {
    message: "Registration ID must be at least 3 characters.",
  }),
});

export function LoginForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registrationId: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    setSubmitError(null);

    const result = await verifyMemberRegistrationId(values.registrationId);

    if (result && result.success && result.memberId) {
      toast({
        title: "Login Successful!",
        description: `Welcome back${result.memberName ? `, ${result.memberName}` : ''}! Redirecting...`
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("loggedInMemberId", result.memberId);
      }
      form.reset();
      router.push(`/member/${result.memberId}`);
    } else {
      const errorMessage = result?.message || "Invalid Registration ID or server error. Please try again.";
      setSubmitError(errorMessage);
      console.error(
        "LoginForm: verifyMemberRegistrationId failed.",
        "Server Message:", errorMessage,
        "Full result from server action:", result,
        "Stringified result:", JSON.stringify(result)
      );
      if (result?.errorDetails) {
        console.error("Server Error Details (from result.errorDetails):", result.errorDetails);
      }
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: errorMessage,
      });
    }

    setIsSubmitting(false);
  }

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <KeyRound className="h-8 w-8 text-primary" />
          <CardTitle className={cn("text-3xl font-bold font-poppins text-primary")}>KurukshetraGym</CardTitle>
        </div>
        <CardDescription>
          Enter your Registration ID to access your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Login Failed</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="registrationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration ID</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <RegistrationBadgeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Enter your Registration ID"
                        {...field}
                        className="pl-10"
                        autoComplete="on"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="text-right text-sm">
              <Link href="/register" className="text-primary hover:underline pr-2">
                Register
              </Link>
              <ForgotIdDialog>
                <Button variant="link" type="button" className="p-0 h-auto text-primary hover:underline">
                  Forgot Registration ID?
                </Button>
              </ForgotIdDialog>
            </div>
             <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Please wait
                </>
              ) : (
                "Login"
              )}
            </Button>
          </form>
        </Form>
        <div className="mt-6 text-center">
          <Link href="/admin/login" className="text-sm text-primary hover:underline">
            Login as Administrator
          </Link>
        </div>
      </CardContent>
      <CardFooter className="text-center text-sm justify-center">
        <Link href="/forum" className="text-primary font-bold hover:underline flex items-center">
          <MessageSquare className="mr-2 h-4 w-4" />
          Ask your questions in our forum
        </Link>
      </CardFooter>
    </Card>
  );
}
