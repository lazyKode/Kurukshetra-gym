
"use client";

import * as React from "react";
import type { UseFormReturn } from "react-hook-form"; // Use type import
import { Badge as BadgeIcon, User, Mail, Phone, RefreshCw, CalendarDays, DollarSign, CalendarIcon as ShadcnCalendarIcon, Pause } from "lucide-react";
import { format, addMonths, addYears, addDays } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FormSchemaType } from "@/lib/schemas/member-schema";
import { verifyRegistrationIdUniqueness } from "@/actions/member-actions";

interface CreateMemberFormFieldsProps {
  form: UseFormReturn<FormSchemaType>;
  originalRegistrationId?: string; // Used in edit mode
}

export function CreateMemberFormFields({ form, originalRegistrationId }: CreateMemberFormFieldsProps) {
  const { toast } = useToast();
  const [isCustomPlanSelected, setIsCustomPlanSelected] = React.useState(form.getValues("userPlan") === "Custom Plan");
  const [calculatedEndDate, setCalculatedEndDate] = React.useState<string | null>(null);
  const [actualEndDateForCalendar, setActualEndDateForCalendar] = React.useState<Date | null>(null);
  const [maxPauseDays, setMaxPauseDays] = React.useState<number>(0);
  const [startDatePopoverOpen, setStartDatePopoverOpen] = React.useState(false);
  const [pauseDatesPopoverOpen, setPauseDatesPopoverOpen] = React.useState(false);
  const [allowPastStartDate, setAllowPastStartDate] = React.useState(false);

  const watchedStartDate = form.watch("startDate");
  const watchedUserPlan = form.watch("userPlan");
  const watchedPauseDates = form.watch("pauseDates");
  const watchedRegistrationId = form.watch("newRegistrationId");
  const [isCheckingId, setIsCheckingId] = React.useState(false);

  React.useEffect(() => {
    const debouncedCheck = setTimeout(async () => {
      if (watchedRegistrationId && watchedRegistrationId.length === 4 && /^[0-9]+$/.test(watchedRegistrationId)) {
        if (originalRegistrationId && watchedRegistrationId === originalRegistrationId) {
          if (form.formState.errors.newRegistrationId?.type === 'manual') {
            form.clearErrors("newRegistrationId");
          }
          return;
        }

        setIsCheckingId(true);
        // Clear previous manual error before new check
        if (form.formState.errors.newRegistrationId?.type === 'manual') {
            form.clearErrors("newRegistrationId");
        }
        try {
          const result = await verifyRegistrationIdUniqueness(watchedRegistrationId);
          if (!result.isUnique) {
            form.setError("newRegistrationId", {
              type: "manual",
              message: result.message || "This Registration ID already exists.",
            });
          } else {
             // If it was previously errored manually and now is unique (or check passed), clear it
            if (form.formState.errors.newRegistrationId?.type === 'manual') {
              form.clearErrors("newRegistrationId");
            }
          }
        } catch (error) {
          console.error("Error checking ID uniqueness client-side:", error);
           form.setError("newRegistrationId", {
              type: "manual",
              message: "Client-side error during uniqueness check. Consult console.",
            });
        } finally {
          setIsCheckingId(false);
        }
      } else {
        if (form.formState.errors.newRegistrationId?.type === 'manual') {
           form.clearErrors("newRegistrationId");
        }
        if (isCheckingId) setIsCheckingId(false);
      }
    }, 750);

    return () => clearTimeout(debouncedCheck);
  }, [watchedRegistrationId, form, originalRegistrationId]);


  React.useEffect(() => {
    setIsCustomPlanSelected(watchedUserPlan === "Custom Plan");
  }, [watchedUserPlan]);

  React.useEffect(() => {
    let currentMaxPauseDays = 0;
    if (watchedUserPlan === "Monthly Plan") {
      currentMaxPauseDays = 2;
    } else if (watchedUserPlan === "3 Month Plan") {
      currentMaxPauseDays = 7;
    } else if (watchedUserPlan === "6 Month Plan") { // Added 6 Month Plan
      currentMaxPauseDays = 15;
    } else if (watchedUserPlan === "Yearly Plan") {
      currentMaxPauseDays = 30;
    }
    setMaxPauseDays(currentMaxPauseDays);

    const currentSelectedPauseDates = form.getValues("pauseDates") || [];

    if (watchedUserPlan === "Custom Plan" || !watchedUserPlan) {
      form.setValue("pauseDates", [], { shouldValidate: false });
      form.clearErrors("pauseDates");
    } else if (currentSelectedPauseDates.length > currentMaxPauseDays) {
        form.setValue("pauseDates", currentSelectedPauseDates.slice(0, currentMaxPauseDays), { shouldValidate: true });
        toast({
            title: "Pause Days Adjusted",
            description: `Selected pause days were reduced to ${currentMaxPauseDays} to fit the new plan's limit.`,
            variant: "default",
        });
    }
  }, [watchedUserPlan, form, toast]);

  React.useEffect(() => {
    if (watchedStartDate && watchedUserPlan) {
      let endDateObj: Date | null = null;
      if (watchedUserPlan === "Monthly Plan") {
        endDateObj = addMonths(new Date(watchedStartDate), 1);
      } else if (watchedUserPlan === "3 Month Plan") {
        endDateObj = addMonths(new Date(watchedStartDate), 3);
      } else if (watchedUserPlan === "6 Month Plan") { // Added 6 Month Plan
        endDateObj = addMonths(new Date(watchedStartDate), 6);
      } else if (watchedUserPlan === "Yearly Plan") {
        endDateObj = addYears(new Date(watchedStartDate), 1);
      }

      if (endDateObj && watchedUserPlan !== "Custom Plan") {
        const pauseDaysNum = watchedPauseDates?.length || 0;
         if (pauseDaysNum > 0) {
          endDateObj = addDays(endDateObj, pauseDaysNum);
        }
      }
      setCalculatedEndDate(endDateObj ? format(endDateObj, "PPP") : null);
      setActualEndDateForCalendar(endDateObj);
    } else {
      setCalculatedEndDate(null);
      setActualEndDateForCalendar(null);
    }
  }, [watchedStartDate, watchedUserPlan, watchedPauseDates]);


  const generateRandomId = () => {
    form.clearErrors("newRegistrationId"); // Clear previous errors before setting new ID
    const randomId = Math.floor(1000 + Math.random() * 9000).toString();
    form.setValue('newRegistrationId', randomId, { shouldValidate: true });
  };


  return (
    <div className="space-y-4">

      <FormField
        control={form.control}
        name="newRegistrationId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Registration ID</FormLabel>
            <div className="flex items-center space-x-2">
              <FormControl>
                <div className="relative w-full">
                  <BadgeIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Enter 4-digit ID or Generate"
                    {...field}
                    className="pl-10"
                    autoComplete="off"
                    maxLength={4}
                    onBlur={() => { // Re-trigger check on blur if needed, though useEffect covers typing
                      if (field.value && field.value.length === 4 && /^[0-9]+$/.test(field.value)) {
                        if (originalRegistrationId && field.value === originalRegistrationId) {
                           if (form.formState.errors.newRegistrationId?.type === 'manual') form.clearErrors("newRegistrationId");
                           return;
                        }
                        // Debounced check in useEffect will handle this, but can add explicit call if desired
                      }
                    }}
                  />
                </div>
              </FormControl>
              <Button
                type="button"
                variant="outline"
                onClick={generateRandomId}
                className="shrink-0"
                disabled={isCheckingId}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {isCheckingId ? "Checking..." : "Generate"}
              </Button>
            </div>
            <FormDescription>
              {isCheckingId
                ? "Checking ID uniqueness..."
                : form.formState.errors.newRegistrationId?.type === 'manual'
                ? null // Error will be shown by FormMessage
                : "Must be a unique 4-digit number."}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="userName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Username</FormLabel>
            <FormControl>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Enter username"
                  {...field}
                  className="pl-10"
                  autoComplete="username"
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="userEmail"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email (Optional)</FormLabel>
            <FormControl>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Enter email address"
                  {...field}
                  className="pl-10"
                  autoComplete="email"
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="userPhoneNumber"
        render={({ field: { onChange: rhfOnChange, ...restFieldProps } }) => (
          <FormItem>
            <FormLabel>Phone Number</FormLabel>
            <FormControl>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="Enter 10-digit phone number"
                  {...restFieldProps}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const { value } = event.target;
                    const numericValue = value.replace(/[^0-9]/g, "");
                    rhfOnChange(numericValue);
                  }}
                  className="pl-10"
                  autoComplete="tel"
                  maxLength={10}
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="userPlan"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Membership Plan</FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                const isCustom = value === "Custom Plan";
                if (!isCustom) {
                  form.setValue("customPlanDuration", "", { shouldValidate: false });
                  form.setValue("customPlanPrice", "", { shouldValidate: false });
                  form.clearErrors("customPlanDuration");
                  form.clearErrors("customPlanPrice");
                } else {
                   form.setValue("pauseDates", [], { shouldValidate: false });
                   form.clearErrors("pauseDates");
                }
              }}
              value={field.value || ""}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a membership plan" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="Monthly Plan">Monthly Plan - 800RS</SelectItem>
                <SelectItem value="3 Month Plan">3 Month Plan - 2000RS</SelectItem>
                <SelectItem value="6 Month Plan">6 Month Plan - 3600RS</SelectItem>
                <SelectItem value="Yearly Plan">Yearly Plan - 6000RS</SelectItem>
                <SelectItem value="Custom Plan">Custom Plan</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
        <div className="flex flex-col w-full sm:w-1/2 space-y-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover open={startDatePopoverOpen} onOpenChange={setStartDatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        <ShadcnCalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? (
                          format(new Date(field.value), "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => {
                        field.onChange(date);
                        setStartDatePopoverOpen(false);
                      }}
                      disabled={(date) => {
                        if (allowPastStartDate) {
                          return false;
                        }
                        return date < new Date(new Date().setDate(new Date().getDate() - 1));
                      }}
                      initialFocus
                      classNames={{
                        day_today: 'bg-yellow-300 text-yellow-800 dark:bg-yellow-600 dark:text-yellow-100 rounded-md',
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem className="flex flex-row items-center space-x-2 pt-1">
            <Checkbox
              id="allowPastStartDateCheckbox"
              checked={allowPastStartDate}
              onCheckedChange={(checked) => setAllowPastStartDate(Boolean(checked))}
            />
            <Label htmlFor="allowPastStartDateCheckbox" className="text-sm font-normal text-muted-foreground hover:text-foreground cursor-pointer">
              Allow past start date
            </Label>
          </FormItem>
        </div>

        <FormItem className="flex flex-col w-full sm:w-1/2">
          <FormLabel>Calculated End Date</FormLabel>
          <FormControl>
            <Input
              value={calculatedEndDate || (watchedUserPlan === "Custom Plan" ? "Track manually for Custom Plan" : "Select plan and start date")}
              disabled
              className="bg-muted/50 cursor-not-allowed"
            />
          </FormControl>
          <FormDescription>
            End date includes any pause days used.
          </FormDescription>
        </FormItem>
      </div>

      {watchedUserPlan && watchedUserPlan !== "Custom Plan" && (
        <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4 pt-2">
          <FormItem className="w-full sm:w-1/2">
            <FormLabel>Pause Days Allowed</FormLabel>
            <FormControl>
              <Input
                value={`${maxPauseDays} days`}
                disabled
                className="bg-muted/50 cursor-not-allowed"
              />
            </FormControl>
            <FormDescription>
              Max pause days for selected plan.
            </FormDescription>
          </FormItem>

          <FormField
            control={form.control}
            name="pauseDates"
            render={({ field }) => (
              <FormItem className="w-full sm:w-1/2 flex flex-col">
                <FormLabel>Select Pause Dates</FormLabel>
                 <Popover open={pauseDatesPopoverOpen} onOpenChange={setPauseDatesPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value?.length && "text-muted-foreground"
                          )}
                        >
                          <Pause className="mr-2 h-4 w-4" />
                          {field.value?.length ? `${field.value.length} day(s) selected` : "Choose pause dates"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="multiple"
                        selected={field.value?.map(date => new Date(date)) || []}
                        onSelect={(dates) => {
                            let newDates = dates === undefined ? [] : dates.map(d => new Date(d));
                            if (newDates.length > maxPauseDays) {
                                newDates = newDates.slice(0, maxPauseDays);
                                toast({
                                    title: "Pause Day Limit Reached",
                                    description: `You can select a maximum of ${maxPauseDays} pause days for this plan.`,
                                    variant: "default",
                                });
                            }
                            field.onChange(newDates);
                            if (newDates.length >= maxPauseDays && maxPauseDays > 0) {
                                setPauseDatesPopoverOpen(false);
                            }
                        }}
                        disabled={(date) => {
                            const today = new Date();
                            today.setHours(0,0,0,0);
                            if (date < today && !allowPastStartDate) return true; // Should generally not allow past pause dates
                            if (watchedStartDate && date < new Date(new Date(watchedStartDate).setHours(0,0,0,0))) return true;
                            // Disable dates beyond a reasonable future limit if original end date is far
                            if (actualEndDateForCalendar && date > addYears(new Date(actualEndDateForCalendar), 1) ) return true;
                            // If actual end date is known, disable beyond that
                            if (actualEndDateForCalendar && watchedUserPlan && watchedUserPlan !== "Custom Plan" && date > new Date(new Date(actualEndDateForCalendar).setHours(0,0,0,0))) return true;
                            return false;
                           }
                        }
                        fromDate={watchedStartDate ? new Date(watchedStartDate) : undefined}
                        // toDate={actualEndDateForCalendar || undefined} // Consider a slightly wider range for selection if needed
                        modifiers={{
                          highlightedStartDate: watchedStartDate ? new Date(watchedStartDate) : undefined,
                          highlightedEndDate: actualEndDateForCalendar || undefined,
                        }}
                        modifiersClassNames={{
                          highlightedStartDate: 'bg-green-200 dark:bg-green-700 text-green-900 dark:text-green-100 rounded-md',
                          highlightedEndDate: 'bg-red-200 dark:bg-red-700 text-red-900 dark:text-red-100 rounded-md',
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                <FormDescription>
                  Select up to {maxPauseDays} days. {(field.value?.length || 0)} selected.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {isCustomPlanSelected && (
        <>
          <FormField
            control={form.control}
            name="customPlanDuration"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Custom Plan Duration (Optional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="e.g., 30 days, 2 months"
                      {...field}
                      value={field.value || ""}
                      className="pl-10"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="customPlanPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Custom Plan Price (RS) (Optional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Enter price in RS"
                      {...field}
                      value={field.value || ""}
                      className="pl-10"
                      type="text"
                      onChange={(e) => {
                        const { value } = e.target;
                        const numericValue = value.replace(/[^0-9]/g, "");
                        field.onChange(numericValue);
                      }}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </div>
  );
}
