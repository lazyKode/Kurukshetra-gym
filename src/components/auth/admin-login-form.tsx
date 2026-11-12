
"use client";

import * as React from "react";
import Link from "next/link"; // Import Link
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { ShieldCheck, KeyRound, Loader2, AlertTriangle } from "lucide-react";

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
  CardFooter, // Import CardFooter
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  password: z.string().min(1, {
    message: "Password is required.",
  }),
});

// Hardcoded admin password for demo purposes
const ADMIN_PASSWORD = "admin";
const DEMO_ADMIN_USER_ID = "admin001"; // This ID should exist in USERS_COLLECTION with isAdmin:true
const MAIN_MEMBER_ID_STORAGE_KEY = "loggedInMemberId"; // Consistent key with forum page

export function AdminLoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    setSubmitError(null);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (values.password === ADMIN_PASSWORD) {
      toast({
        title: "Admin Login Successful",
        description: "Redirecting to dashboard...",
      });
      // Store the demo admin ID in localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(MAIN_MEMBER_ID_STORAGE_KEY, DEMO_ADMIN_USER_ID);
      }
      router.push("/admin/dashboard");
    } else {
      const errorMessage = "Invalid admin password. Please try again.";
      setSubmitError(errorMessage);
      toast({
        variant: "destructive",
        title: "Admin Login Failed",
        description: errorMessage,
      });
    }

    setIsSubmitting(false);
  }

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <CardTitle className="text-3xl font-bold">Administrator Login</CardTitle>
        </div>
        <CardDescription>
          Enter the administrator password to continue.
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="Enter admin password"
                        {...field}
                        className="pl-10"
                        autoComplete="current-password"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="text-right text-sm">
              <Link href="#" className="text-primary hover:underline">
                Forgot Password?
              </Link>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Login as Admin"
              )}
            </Button>
          </form>
        </Form>
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-primary hover:underline">
            Back to Member's Login
          </Link>
        </div>
      </CardContent>
      <CardFooter className="text-center text-sm text-muted-foreground justify-center">
      </CardFooter>
    </Card>
  );
}
