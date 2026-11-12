import {z} from "zod";

export const formSchema = z.object({
  // Define your schema fields here. For example:
  userName: z.string().min(1, "Name is required"),
  userEmail: z.string().email("Invalid email address").optional(),
  userPhoneNumber: z.string()
    .min(10, "Phone number is required")
    .max(15, "Invalid phone number"),
  userPlan: z.enum([
    "Monthly Plan",
    "Quarterly Plan",
    "Annual Plan",
    "Custom Plan",
  ]),
  startDate: z.date(),
  dateOfBirth: z.date().optional(),
  customPlanDuration: z.string().optional(),
  customPlanPrice: z.string().optional(),
});

export type FormSchemaType = z.infer<typeof formSchema>;
