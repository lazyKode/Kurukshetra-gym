import type {FormSchemaType} from "../schemas/member-schema";
import type {Timestamp} from "firebase-admin/firestore";

export interface StoredMember {
  newRegistrationId: string;
  startDate?: Date;
  pauseDates?: Date[];
  userName: string;
  userEmail?: string | undefined;
  userPhoneNumber: string;
  userPlan: FormSchemaType["userPlan"];
  dateOfBirth?: Date | null | undefined;
  endDate?: Date | null | undefined;
  customPlanDuration?: string;
  customPlanPrice?: string;
  userPhoto?: string;
  canRequestProfileUpdates: boolean;
}

export interface ChangeRequest {
  requestId?: string;
  memberId: string;
  memberName: string;
  fieldName: "userName" | "userEmail" | "userPhoneNumber" | "userPlan" | "startDate";
  currentValue: string;
  requestedValue: string;
  requestDate: Timestamp | Date; // Firestore timestamp or JS Date after conversion
}

export interface NotificationType {
  notificationId?: string;
  memberId: string;
  senderName: string;
  message: string;
  timestamp: Timestamp | Date; // Firestore timestamp or JS Date after conversion
  isRead?: boolean;
}

export interface PaymentConfirmationRequest {
  confirmationId?: string;
  memberId: string;
  memberName: string;
  amount: number;
  paymentDate: Timestamp | Date; // Firestore timestamp or JS Date after conversion
  status: "pending" | "confirmed" | "rejected";
}
