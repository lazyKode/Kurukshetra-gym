
import type { FormSchemaType } from "@/lib/schemas/member-schema";
import type { Timestamp } from 'firebase-admin/firestore';

export type AccountStatus = 
  | 'pending_initial_payment' 
  | 'active' 
  | 'inactive_payment_rejected' 
  | 'membership_expired' 
  | 'paused'; // Added 'paused' as a potential future status

export interface StoredMember {
  newRegistrationId: string;
  accountStatus: AccountStatus; // New field
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
  fieldName: 'userName' | 'userEmail' | 'userPhoneNumber' | 'userPlan' | 'startDate';
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
  status: 'pending' | 'confirmed' | 'rejected';
  notes?: string; // Added notes field
}

export interface RegistrationIdReminderRequest {
  reminderId: string;
  identifier: string; 
  identifierType: 'email' | 'phone';
  status: 'pending' | 'resolved';
  requestDate: Timestamp | Date;
}

