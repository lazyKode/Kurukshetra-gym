// On-device implementation of src/actions/member-actions.ts.
// The GitHub Pages build swaps this in for the server actions (see next.config.mjs),
// so every function here keeps the same name, arguments and result shape.

import { format } from "date-fns";
import { formSchema, type FormSchemaType as MemberFormDataType } from "@/lib/schemas/member-schema";
import type {
  StoredMember,
  ChangeRequest,
  NotificationType,
  PaymentConfirmationRequest,
  RegistrationIdReminderRequest,
  AccountStatus,
} from "@/lib/types/member-types";
import { deleteDoc, errorMessage, getDoc, listDocs, newId, setDoc, toDate, updateDoc } from "./store";

const MEMBERS = "kkrdb";
const CHANGE_REQUESTS = "changeRequests";
const NOTIFICATIONS = "notifications";
const PAYMENT_CONFIRMATIONS = "paymentConfirmations";
const REMINDERS = "registrationIdReminders";

const VALID_STATUSES: AccountStatus[] = [
  "pending_initial_payment",
  "active",
  "inactive_payment_rejected",
  "membership_expired",
  "paused",
];

const time = (value: any) => toDate(value)?.getTime() ?? 0;

const toStoredMember = (id: string, data: Record<string, any>): StoredMember => ({
  newRegistrationId: id,
  accountStatus: VALID_STATUSES.includes(data.accountStatus) ? data.accountStatus : "active",
  startDate: toDate(data.startDate),
  pauseDates: Array.isArray(data.pauseDates)
    ? data.pauseDates.map(toDate).filter((d: Date | undefined): d is Date => d instanceof Date)
    : [],
  dateOfBirth: toDate(data.dateOfBirth),
  userName: data.userName || "",
  userEmail: data.userEmail || "",
  userPhoneNumber: data.userPhoneNumber || "",
  userPlan: data.userPlan ?? "Monthly Plan",
  endDate: toDate(data.endDate),
  customPlanDuration: data.customPlanDuration || "",
  customPlanPrice: data.customPlanPrice || "",
  userPhoto: data.userPhoto || "",
  canRequestProfileUpdates: data.canRequestProfileUpdates ?? true,
});

const toStorableMemberFields = (values: Omit<MemberFormDataType, "newRegistrationId">) => ({
  ...values,
  startDate: toDate(values.startDate) ?? new Date(),
  endDate: toDate(values.endDate) ?? null,
  dateOfBirth: toDate(values.dateOfBirth) ?? null,
  pauseDates: Array.isArray(values.pauseDates)
    ? values.pauseDates.map(toDate).filter((d): d is Date => d instanceof Date)
    : [],
});

const initialAmountFor = (values: MemberFormDataType): number => {
  switch (values.userPlan) {
    case "Monthly Plan":
      return 800;
    case "3 Month Plan":
      return 2000;
    case "6 Month Plan":
      return 3600;
    case "Yearly Plan":
      return 6000;
    case "Custom Plan": {
      const price = parseInt(values.customPlanPrice ?? "", 10);
      return isNaN(price) ? 0 : price;
    }
    default:
      return 0;
  }
};

const getMaxPauseDaysForPlan = (plan: StoredMember["userPlan"] | undefined): number => {
  switch (plan) {
    case "Monthly Plan":
      return 2;
    case "3 Month Plan":
      return 7;
    case "6 Month Plan":
      return 15;
    case "Yearly Plan":
      return 30;
    default:
      return 0;
  }
};

const isBlank = (value: unknown) => !value || typeof value !== "string" || value.trim() === "";

export async function addMemberToDb(
  values: MemberFormDataType
): Promise<{ success: boolean; message: string; memberId?: string }> {
  const validationResult = formSchema.safeParse(values);
  if (!validationResult.success) {
    return { success: false, message: "Invalid member data." };
  }
  const memberFormData = validationResult.data;
  if (isBlank(memberFormData.newRegistrationId)) {
    return { success: false, message: "Registration ID is missing or invalid." };
  }
  const id = memberFormData.newRegistrationId.trim();
  const uniquenessCheck = await verifyRegistrationIdUniqueness(id);
  if (!uniquenessCheck.isUnique) {
    return { success: false, message: uniquenessCheck.message || `Registration ID ${id} already exists.` };
  }
  try {
    const { newRegistrationId: _omit, ...dataToStore } = memberFormData;
    await setDoc(MEMBERS, id, {
      ...toStorableMemberFields(dataToStore),
      accountStatus: "pending_initial_payment" as AccountStatus,
      canRequestProfileUpdates: true,
    });
    const confirmationId = newId();
    const paymentRequest: PaymentConfirmationRequest = {
      confirmationId,
      memberId: id,
      memberName: memberFormData.userName,
      amount: initialAmountFor(memberFormData),
      paymentDate: new Date(),
      status: "pending",
    };
    await setDoc(PAYMENT_CONFIRMATIONS, confirmationId, paymentRequest);
    return { success: true, message: "Member added successfully and initial payment record created.", memberId: id };
  } catch (error) {
    return { success: false, message: `Failed to add member. Error: ${errorMessage(error)}` };
  }
}

export async function getMembersFromDb(): Promise<{ success: boolean; members?: StoredMember[]; message?: string }> {
  try {
    const docs = await listDocs(MEMBERS);
    return { success: true, members: docs.map((doc) => toStoredMember(doc.id, doc.data)) };
  } catch (error) {
    return { success: false, message: `Failed to load members. Error: ${errorMessage(error)}` };
  }
}

export async function deleteMemberFromDb(memberId: string): Promise<{ success: boolean; message: string }> {
  if (isBlank(memberId)) {
    return { success: false, message: "Invalid Member ID format for deletion." };
  }
  try {
    await deleteDoc(MEMBERS, memberId.trim());
    return { success: true, message: `Member with ID ${memberId} deleted successfully.` };
  } catch (error) {
    return { success: false, message: `Failed to delete member with ID ${memberId}. Error: ${errorMessage(error)}` };
  }
}

export async function verifyRegistrationIdUniqueness(
  registrationId: string
): Promise<{ isUnique: boolean; message?: string; errorDetails?: any }> {
  if (isBlank(registrationId)) {
    return { isUnique: false, message: "Invalid Registration ID format for uniqueness check." };
  }
  const id = registrationId.trim();
  try {
    if (await getDoc(MEMBERS, id)) {
      return { isUnique: false, message: `Registration ID '${id}' already exists.` };
    }
    return { isUnique: true };
  } catch (error) {
    return { isUnique: false, message: `Error checking ID '${id}': ${errorMessage(error)}`, errorDetails: error };
  }
}

export async function verifyMemberRegistrationId(registrationId: string): Promise<{
  success: boolean;
  message: string;
  memberName?: string;
  memberId?: string;
  errorDetails?: any;
  attemptedPath?: string;
}> {
  if (isBlank(registrationId)) {
    return { success: false, message: "Invalid Registration ID format for verification.", attemptedPath: "N/A" };
  }
  const id = registrationId.trim();
  const attemptedPath = `${MEMBERS}/${id}`;
  try {
    const data = await getDoc(MEMBERS, id);
    if (!data) {
      return {
        success: false,
        message: "Registration ID not found. Please check your ID and try again.",
        attemptedPath,
      };
    }
    return {
      success: true,
      message: "Registration ID verified.",
      memberName: toStoredMember(id, data).userName,
      memberId: id,
      attemptedPath,
    };
  } catch (error) {
    return {
      success: false,
      message: `An unexpected error occurred during member verification: ${errorMessage(error)}`,
      errorDetails: error,
      attemptedPath,
    };
  }
}

export async function getMemberByIdFromDb(
  id: string
): Promise<{ success: boolean; member?: StoredMember; message?: string }> {
  if (isBlank(id)) {
    return { success: false, message: "Invalid ID format." };
  }
  const trimmedId = id.trim();
  try {
    const data = await getDoc(MEMBERS, trimmedId);
    if (data) {
      return { success: true, member: toStoredMember(trimmedId, data) };
    }
    const byPhone = (await listDocs(MEMBERS)).find((doc) => doc.data.userPhoneNumber === trimmedId);
    if (byPhone) {
      return { success: true, member: toStoredMember(byPhone.id, byPhone.data) };
    }
    return { success: false, message: "Member not found by ID or Phone Number." };
  } catch (error) {
    return { success: false, message: `Failed to fetch member ${trimmedId}. Error: ${errorMessage(error)}` };
  }
}

export async function updateMemberPauseDates(
  registrationId: string,
  newPauseDates: Date[]
): Promise<{ success: boolean; message: string; member?: StoredMember }> {
  if (isBlank(registrationId)) {
    return { success: false, message: "Invalid Registration ID." };
  }
  const id = registrationId.trim();
  try {
    const memberResult = await getMemberByIdFromDb(id);
    if (!memberResult.success || !memberResult.member) {
      return { success: false, message: memberResult.message || `Member with ID ${id} not found.` };
    }
    const member = memberResult.member;
    if (member.userPlan === "Custom Plan") {
      return { success: false, message: "Pause days cannot be updated for Custom Plans." };
    }
    const maxPauseDays = getMaxPauseDaysForPlan(member.userPlan);
    if (newPauseDates.length > maxPauseDays) {
      return {
        success: false,
        message: `Number of pause days (${newPauseDates.length}) exceeds max (${maxPauseDays}).`,
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = member.startDate ? new Date(member.startDate) : today;
    startDate.setHours(0, 0, 0, 0);
    for (const pauseDate of newPauseDates) {
      const normalized = new Date(pauseDate);
      normalized.setHours(0, 0, 0, 0);
      if (normalized < startDate) {
        return {
          success: false,
          message: `Pause date ${format(new Date(pauseDate), "PPP")} cannot be before start date ${format(startDate, "PPP")}.`,
        };
      }
    }
    await updateDoc(MEMBERS, member.newRegistrationId, { pauseDates: newPauseDates.map((d) => new Date(d)) });
    const updated = await getMemberByIdFromDb(member.newRegistrationId);
    if (!updated.success || !updated.member) {
      throw new Error("Failed to fetch member after pause date update.");
    }
    return { success: true, message: "Pause dates updated successfully.", member: updated.member };
  } catch (error) {
    return { success: false, message: `Failed to update pause dates. Error: ${errorMessage(error)}` };
  }
}

export async function updateMemberPhoto(
  registrationId: string,
  photoDataUri: string
): Promise<{ success: boolean; message: string; member?: StoredMember }> {
  if (isBlank(registrationId)) {
    return { success: false, message: "Invalid Registration ID." };
  }
  if (photoDataUri && !photoDataUri.startsWith("data:image/")) {
    return { success: false, message: "Invalid photo data format." };
  }
  const id = registrationId.trim();
  try {
    await updateDoc(MEMBERS, id, { userPhoto: photoDataUri });
    const updated = await getMemberByIdFromDb(id);
    if (!updated.success || !updated.member) {
      throw new Error("Failed to fetch member after photo update.");
    }
    return { success: true, message: "Photo updated successfully.", member: updated.member };
  } catch (error) {
    return { success: false, message: `Failed to update photo. Error: ${errorMessage(error)}` };
  }
}

export async function updateMemberInDb(
  currentRegistrationId: string,
  updatedValues: MemberFormDataType
): Promise<{ success: boolean; message: string; member?: StoredMember; newMemberId?: string }> {
  if (isBlank(currentRegistrationId)) {
    return { success: false, message: "Invalid current Registration ID." };
  }
  const validationResult = formSchema.safeParse(updatedValues);
  if (!validationResult.success) {
    return { success: false, message: "Invalid member data for update." };
  }
  const currentId = currentRegistrationId.trim();
  const { newRegistrationId: formRegId, ...dataToStore } = validationResult.data;
  if (isBlank(formRegId)) {
    return { success: false, message: "New Registration ID from form is missing or invalid." };
  }
  const newIdFromForm = formRegId.trim();
  const fields = toStorableMemberFields(dataToStore);
  try {
    if (newIdFromForm !== currentId) {
      const uniquenessCheck = await verifyRegistrationIdUniqueness(newIdFromForm);
      if (!uniquenessCheck.isUnique) {
        return {
          success: false,
          message: uniquenessCheck.message || `New Registration ID ${newIdFromForm} is already in use.`,
        };
      }
      const existing = await getDoc(MEMBERS, currentId);
      if (!existing) {
        return { success: false, message: `Original member ${currentId} not found. Cannot update.` };
      }
      await setDoc(MEMBERS, newIdFromForm, {
        ...existing,
        ...fields,
        accountStatus: existing.accountStatus ?? "active",
        canRequestProfileUpdates: existing.canRequestProfileUpdates ?? true,
      });
      await deleteDoc(MEMBERS, currentId);
      const finalResult = await getMemberByIdFromDb(newIdFromForm);
      return {
        success: true,
        message: "Member updated successfully (ID changed).",
        member: finalResult.member,
        newMemberId: newIdFromForm,
      };
    }
    await updateDoc(MEMBERS, currentId, fields);
    const updated = await getMemberByIdFromDb(currentId);
    return { success: true, message: "Member updated successfully.", member: updated.member };
  } catch (error) {
    return { success: false, message: `Failed to update member. Error: ${errorMessage(error)}` };
  }
}

export async function submitProfileUpdateRequest(
  memberId: string,
  fieldName: ChangeRequest["fieldName"],
  requestedValue: string
): Promise<{ success: boolean; message: string }> {
  try {
    const memberData = await getDoc(MEMBERS, memberId);
    if (!memberData) {
      return { success: false, message: "Member not found." };
    }
    let currentValue = "";
    switch (fieldName) {
      case "userName":
      case "userEmail":
      case "userPhoneNumber":
      case "userPlan":
        currentValue = memberData[fieldName] || "";
        break;
      case "startDate": {
        const startDate = toDate(memberData.startDate);
        currentValue = startDate ? format(startDate, "yyyy-MM-dd") : "N/A";
        break;
      }
      default:
        return { success: false, message: `Invalid field name: ${fieldName}` };
    }
    const requestId = newId();
    const request: ChangeRequest = {
      requestId,
      memberId,
      memberName: memberData.userName || "N/A",
      fieldName,
      currentValue,
      requestedValue,
      requestDate: new Date(),
    };
    await setDoc(CHANGE_REQUESTS, requestId, request);
    return { success: true, message: "Profile update request submitted successfully." };
  } catch (error) {
    return { success: false, message: `Failed to submit request. Error: ${errorMessage(error)}` };
  }
}

export async function getProfileUpdateRequests(): Promise<{
  success: boolean;
  requests?: (ChangeRequest & { requestId: string })[];
  message?: string;
}> {
  try {
    const docs = await listDocs(CHANGE_REQUESTS);
    const requests = docs
      .map((doc) => ({ ...doc.data, requestId: doc.id }) as ChangeRequest & { requestId: string })
      .sort((a, b) => time(b.requestDate) - time(a.requestDate));
    return { success: true, requests };
  } catch (error) {
    return { success: false, message: `Failed to fetch requests. Error: ${errorMessage(error)}` };
  }
}

export async function dismissProfileUpdateRequest(requestId: string): Promise<{ success: boolean; message: string }> {
  try {
    await deleteDoc(CHANGE_REQUESTS, requestId);
    return { success: true, message: "Request dismissed successfully." };
  } catch (error) {
    return { success: false, message: `Failed to dismiss request. Error: ${errorMessage(error)}` };
  }
}

export async function sendNotificationToMember(
  targetMemberId: string,
  message: string
): Promise<{ success: boolean; message: string }> {
  try {
    const notificationId = newId();
    const notification: NotificationType = {
      notificationId,
      memberId: targetMemberId,
      senderName: "Admin",
      message,
      timestamp: new Date(),
      isRead: false,
    };
    await setDoc(NOTIFICATIONS, notificationId, notification);
    return { success: true, message: "Notification sent successfully." };
  } catch (error) {
    return { success: false, message: `Failed to send notification. Error: ${errorMessage(error)}` };
  }
}

export async function getNotificationsForMember(memberId: string): Promise<{
  success: boolean;
  notifications?: (NotificationType & { notificationId: string })[];
  message?: string;
}> {
  try {
    const docs = await listDocs(NOTIFICATIONS);
    const notifications = docs
      .filter((doc) => doc.data.memberId === memberId)
      .map((doc) => ({ ...doc.data, notificationId: doc.id }) as NotificationType & { notificationId: string })
      .sort((a, b) => time(b.timestamp) - time(a.timestamp));
    return { success: true, notifications };
  } catch (error) {
    return { success: false, message: `Failed to fetch notifications. Error: ${errorMessage(error)}` };
  }
}

export async function markMemberNotificationsAsRead(memberId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const docs = await listDocs(NOTIFICATIONS);
    for (const doc of docs) {
      if (doc.data.memberId === memberId && doc.data.isRead === false) {
        await updateDoc(NOTIFICATIONS, doc.id, { isRead: true });
      }
    }
    return { success: true, message: "Notifications marked as read." };
  } catch (error) {
    return { success: false, message: `Failed to mark notifications as read. Error: ${errorMessage(error)}` };
  }
}

export async function toggleProfileUpdatePermission(
  memberId: string,
  enable: boolean
): Promise<{ success: boolean; message: string }> {
  try {
    await updateDoc(MEMBERS, memberId, { canRequestProfileUpdates: enable });
    return { success: true, message: `Profile update requests ${enable ? "enabled" : "disabled"} for member.` };
  } catch (error) {
    return { success: false, message: `Failed to update permission. Error: ${errorMessage(error)}` };
  }
}

export async function requestPaymentConfirmation(
  memberId: string,
  amount: number
): Promise<{ success: boolean; message: string }> {
  try {
    const memberData = await getDoc(MEMBERS, memberId);
    if (!memberData) {
      return { success: false, message: "Member not found to request payment confirmation." };
    }
    const confirmationId = newId();
    const confirmation: PaymentConfirmationRequest = {
      confirmationId,
      memberId,
      memberName: memberData.userName || "N/A",
      amount,
      paymentDate: new Date(),
      status: "pending",
    };
    await setDoc(PAYMENT_CONFIRMATIONS, confirmationId, confirmation);
    return { success: true, message: "Admin has been notified of your payment. It will be confirmed shortly." };
  } catch (error) {
    return { success: false, message: `Failed to notify admin of payment. Error: ${errorMessage(error)}` };
  }
}

export async function getPendingPaymentConfirmations(): Promise<{
  success: boolean;
  requests?: (PaymentConfirmationRequest & { confirmationId: string })[];
  message?: string;
}> {
  try {
    const docs = await listDocs(PAYMENT_CONFIRMATIONS);
    const requests = docs
      .filter((doc) => doc.data.status === "pending")
      .map(
        (doc) => ({ ...doc.data, confirmationId: doc.id }) as PaymentConfirmationRequest & { confirmationId: string }
      )
      .sort((a, b) => time(a.paymentDate) - time(b.paymentDate));
    return { success: true, requests };
  } catch (error) {
    return { success: false, message: `Failed to fetch pending payment confirmations. Error: ${errorMessage(error)}` };
  }
}

export async function confirmPayment(confirmationId: string): Promise<{ success: boolean; message: string }> {
  try {
    const confirmation = (await getDoc(PAYMENT_CONFIRMATIONS, confirmationId)) as PaymentConfirmationRequest | undefined;
    if (!confirmation) {
      return { success: false, message: "Payment confirmation request not found." };
    }
    const memberData = await getDoc(MEMBERS, confirmation.memberId);
    if (!memberData) {
      await updateDoc(PAYMENT_CONFIRMATIONS, confirmationId, {
        status: "rejected",
        notes: "Member record not found during confirmation.",
      });
      return { success: false, message: "Member associated with this payment not found. Payment rejected." };
    }
    const memberUpdate: Record<string, any> = { accountStatus: "active" as AccountStatus };
    if (memberData.userPlan !== "Custom Plan") {
      memberUpdate.startDate = new Date();
      memberUpdate.pauseDates = [];
      memberUpdate.endDate = null;
    }
    await updateDoc(MEMBERS, confirmation.memberId, memberUpdate);
    await updateDoc(PAYMENT_CONFIRMATIONS, confirmationId, { status: "confirmed" });
    await sendNotificationToMember(
      confirmation.memberId,
      `Your payment of ${confirmation.amount}RS has been confirmed and your membership updated.`
    );
    return { success: true, message: "Payment confirmed, member updated, and notification sent." };
  } catch (error) {
    return { success: false, message: `Failed to confirm payment. Error: ${errorMessage(error)}` };
  }
}

export async function rejectPayment(confirmationId: string): Promise<{ success: boolean; message: string }> {
  try {
    const confirmation = (await getDoc(PAYMENT_CONFIRMATIONS, confirmationId)) as PaymentConfirmationRequest | undefined;
    if (!confirmation) {
      return { success: false, message: "Payment confirmation request not found." };
    }
    await updateDoc(PAYMENT_CONFIRMATIONS, confirmationId, { status: "rejected" });
    await updateDoc(MEMBERS, confirmation.memberId, { accountStatus: "inactive_payment_rejected" });
    await sendNotificationToMember(
      confirmation.memberId,
      `Your recent payment confirmation request for ${confirmation.amount}RS could not be verified and has been rejected. Please contact support.`
    );
    return { success: true, message: "Payment rejected and notification sent." };
  } catch (error) {
    return { success: false, message: `Failed to reject payment. Error: ${errorMessage(error)}` };
  }
}

export async function submitRegistrationIdReminder(
  identifier: string,
  identifierType: "email" | "phone"
): Promise<{ success: boolean; message: string; reminderId?: string }> {
  if (isBlank(identifier)) {
    return { success: false, message: `The ${identifierType} provided is empty.` };
  }
  if (identifierType !== "email" && identifierType !== "phone") {
    return { success: false, message: "Invalid identifier type specified." };
  }
  const trimmedIdentifier = identifier.trim();
  try {
    const field = identifierType === "phone" ? "userPhoneNumber" : "userEmail";
    const match = (await listDocs(MEMBERS)).find((doc) => doc.data[field] === trimmedIdentifier);
    if (!match) {
      return {
        success: false,
        message:
          identifierType === "phone"
            ? "Phone number not found in our records. Please ensure you entered it correctly or contact support if you believe this is an error."
            : "Email address not found in our records. Please ensure you entered it correctly or contact support.",
      };
    }
    const reminderId = newId();
    const reminder: RegistrationIdReminderRequest = {
      reminderId,
      identifier: trimmedIdentifier,
      identifierType,
      status: "pending",
      requestDate: new Date(),
    };
    await setDoc(REMINDERS, reminderId, {
      ...reminder,
      matchedMemberId: match.id,
      matchedMemberName: match.data.userName || "N/A",
    });
    return {
      success: true,
      message:
        "Your request for a Registration ID reminder has been submitted. An administrator will review it and contact you shortly.",
      reminderId,
    };
  } catch (error) {
    return { success: false, message: `Failed to submit reminder request. Error: ${errorMessage(error)}` };
  }
}

export async function getPendingRegistrationIdReminders(): Promise<{
  success: boolean;
  reminders?: (RegistrationIdReminderRequest & { reminderId: string })[];
  message?: string;
}> {
  try {
    const docs = await listDocs(REMINDERS);
    const reminders = docs
      .filter((doc) => doc.data.status === "pending")
      .map(
        (doc) => ({ ...doc.data, reminderId: doc.id }) as RegistrationIdReminderRequest & { reminderId: string }
      )
      .sort((a, b) => time(a.requestDate) - time(b.requestDate));
    return { success: true, reminders };
  } catch (error) {
    return { success: false, message: `Failed to fetch Reg ID reminders. Error: ${errorMessage(error)}` };
  }
}

export async function resolveRegistrationIdReminder(reminderId: string): Promise<{ success: boolean; message: string }> {
  try {
    await updateDoc(REMINDERS, reminderId, { status: "resolved" });
    return { success: true, message: "Reminder marked as resolved." };
  } catch (error) {
    return { success: false, message: `Failed to resolve reminder. Error: ${errorMessage(error)}` };
  }
}

export async function updateMemberAccountStatus(
  memberId: string,
  newStatus: AccountStatus
): Promise<{ success: boolean; message: string; member?: StoredMember }> {
  if (isBlank(memberId)) {
    return { success: false, message: "Invalid Member ID." };
  }
  if (!VALID_STATUSES.includes(newStatus)) {
    return { success: false, message: "Invalid account status provided." };
  }
  const id = memberId.trim();
  try {
    if (!(await getDoc(MEMBERS, id))) {
      return { success: false, message: `Member with ID ${memberId} not found.` };
    }
    await updateDoc(MEMBERS, id, { accountStatus: newStatus });
    const updated = await getMemberByIdFromDb(id);
    if (!updated.success || !updated.member) {
      return { success: true, message: "Member status updated successfully, but could not re-fetch member details." };
    }
    return { success: true, message: "Member account status updated successfully.", member: updated.member };
  } catch (error) {
    return { success: false, message: `Failed to update member status. Error: ${errorMessage(error)}` };
  }
}
