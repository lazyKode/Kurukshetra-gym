
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Loader2, KeyRound } from "lucide-react";
// import { useToast } from "@/hooks/use-toast"; // Toast is handled by the caller now
import { verifyMemberRegistrationId } from "@/actions/member-actions";

const registrationIdLoginSchema = z.object({
  registrationId: z.string()
    .length(4, "Registration ID must be 4 digits.")
    .regex(/^\d{4}$/, "Registration ID must be 4 digits."),
});

type RegistrationIdFormValues = z.infer<typeof registrationIdLoginSchema>;

interface RegistrationIdLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (registrationId: string) => void; // Caller handles success (e.g., toast)
}

export function RegistrationIdLoginDialog({ open, onOpenChange, onSuccess }: RegistrationIdLoginDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  // const { toast } = useToast(); // Toast is handled by the caller

  const form = useForm<RegistrationIdFormValues>({
    resolver: zodResolver(registrationIdLoginSchema),
    defaultValues: {
      registrationId: "",
    },
  });

  const handleDialogSubmit = async (values: RegistrationIdFormValues) => {
    setIsSubmitting(true);
    form.clearErrors(); // Clear previous errors
    
    const verificationResult = await verifyMemberRegistrationId(values.registrationId);

    if (verificationResult.success && verificationResult.memberId) {
      onSuccess(values.registrationId); // Pass ID to success handler
      // Dialog close and form reset handled by onOpenChange and caller
    } else {
      form.setError("registrationId", { 
        type: "manual", 
        message: verificationResult.message || "Invalid Registration ID or user not found." 
      });
      // Toast for failure can be handled by the caller if desired
    }
    setIsSubmitting(false);
  };
  
  const handleDialogClose = (isOpen: boolean) => {
    if (!isSubmitting) { // Prevent closing while submitting
        onOpenChange(isOpen);
        if (!isOpen) { // Reset form if dialog is closed by cancel or X
            form.reset();
            form.clearErrors();
        }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enter Registration ID</DialogTitle>
          <DialogDescription>
            Enter your 4-digit Registration ID to ask questions and reply. This ID will be displayed with your posts.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleDialogSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="registrationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration ID</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        placeholder="Enter your 4-digit ID" 
                        {...field} 
                        className="pl-10"
                        maxLength={4}
                        type="text" 
                        inputMode="numeric"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Login to Forum
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


    