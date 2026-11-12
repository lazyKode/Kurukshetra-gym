
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Phone, Loader2, AlertTriangle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { submitRegistrationIdReminder } from "@/actions/member-actions";

const forgotIdFormSchema = z.object({
  identifier: z.string()
    .min(10, { message: "Phone number must be 10 digits." })
    .max(10, { message: "Phone number must be 10 digits." })
    .regex(/^[0-9]+$/, { message: "Phone number must only contain digits." }),
  identifierType: z.literal("phone"), // For now, only phone
});

type ForgotIdFormValues = z.infer<typeof forgotIdFormSchema>;

interface ForgotIdDialogProps {
  children: React.ReactNode; // To be used as DialogTrigger
}

export function ForgotIdDialog({ children }: ForgotIdDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);

  const form = useForm<ForgotIdFormValues>({
    resolver: zodResolver(forgotIdFormSchema),
    defaultValues: {
      identifier: "",
      identifierType: "phone",
    },
  });

  async function onSubmit(values: ForgotIdFormValues) {
    setIsSubmitting(true);
    setSubmitError(null);

    console.log("ForgotIdDialog: Submitting with values:", values); // DIAGNOSTIC LOG

    const result = await submitRegistrationIdReminder(values.identifier, values.identifierType);

    console.log("ForgotIdDialog: Server action result:", result); // DIAGNOSTIC LOG

    if (result.success) {
      toast({
        title: "Request Submitted",
        description: result.message,
      });
      form.reset();
      setIsOpen(false); // Close dialog on success
    } else {
      setSubmitError(result.message || "Failed to submit request. Please try again.");
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: result.message || "Could not submit your request.",
      });
    }
    setIsSubmitting(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        form.reset();
        setSubmitError(null);
      }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Forgot Registration ID?</DialogTitle>
          <DialogDescription>
            Enter your 10-digit phone number. If it matches our records, a reminder request will be sent to the administrator.
          </DialogDescription>
        </DialogHeader>
        {submitError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Enter your 10-digit phone"
                        {...field}
                        className="pl-10"
                        type="tel"
                        maxLength={10}
                        autoComplete="tel"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
