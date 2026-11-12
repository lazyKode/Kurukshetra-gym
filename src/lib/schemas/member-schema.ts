
import * as z from "zod";

// This enum needs to be defined here or imported if it's used elsewhere centrally.
// For now, defining it directly here.
const planEnum = z.enum(["Monthly Plan", "3 Month Plan", "6 Month Plan", "Yearly Plan", "Custom Plan"], {
  required_error: "Please select a membership plan.",
});

export const formSchema = z.object({
  userPhoto: z.string().refine((val) => val === "" || val.startsWith("data:image/"), { message: "Invalid image data format." }).optional().or(z.literal("")),
  newRegistrationId: z.string()
    .length(4, { message: "Registration ID must be exactly 4 digits." })
    .regex(/^[0-9]+$/, { message: "Registration ID must only contain digits." }),
  userName: z.string().min(3, { message: "Username must be at least 3 characters." }).max(50, { message: "Username must be at most 50 characters."}),
  userEmail: z.string().email({ message: "Please enter a valid email address." }).optional().or(z.literal("")),
  userPhoneNumber: z.string()
    .length(10, { message: "Phone number must be exactly 10 digits." })
    .regex(/^[0-9]+$/, { message: "Phone number must only contain digits." }),
  userPlan: planEnum,
  startDate: z.date({
    required_error: "Start date is required.",
  }),
  dateOfBirth: z.date().optional(),
  endDate: z.date().optional(),
  customPlanDuration: z.string().optional(),
  customPlanPrice: z.string().regex(/^[0-9]*$/, { message: "Price must only contain digits." }).optional(),
  pauseDates: z.array(z.date()).optional(),
}).refine(data => {
  if (data.userPlan && data.userPlan !== "Custom Plan" && data.pauseDates) {
    let allowed = 0;
    if (data.userPlan === "Monthly Plan") allowed = 2;
    else if (data.userPlan === "3 Month Plan") allowed = 7;
    else if (data.userPlan === "6 Month Plan") allowed = 15; // Added 6 Month Plan
    else if (data.userPlan === "Yearly Plan") allowed = 30;
    
    return data.pauseDates.length <= allowed;
  }
  return true;
}, {
  message: "Number of selected pause dates cannot exceed the plan's maximum.",
  path: ["pauseDates"],
});

export type FormSchemaType = z.infer<typeof formSchema>;
