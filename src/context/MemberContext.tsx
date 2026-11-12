
"use client";

import type { ReactNode } from 'react'; 
import * as React from "react";
import type { StoredMember } from "@/lib/types/member-types";

interface MemberContextType {
  members: StoredMember[];
  setMembers: React.Dispatch<React.SetStateAction<StoredMember[]>>;
  refetchMembersId: number; 
  triggerRefetchMembers: () => void; 
  refetchPaymentsId: number;
  triggerRefetchPayments: () => void;
}

const MemberContext = React.createContext<MemberContextType | undefined>(undefined);

export function MemberProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = React.useState<StoredMember[]>([]);
  const [refetchMembersId, setRefetchMembersId] = React.useState(0); 
  const [refetchPaymentsId, setRefetchPaymentsId] = React.useState(0);

  const triggerRefetchMembers = () => {
    setRefetchMembersId(id => id + 1); 
  };

  const triggerRefetchPayments = () => {
    setRefetchPaymentsId(id => id + 1);
  };

  return (
    <MemberContext.Provider value={{ 
      members, 
      setMembers, 
      refetchMembersId, 
      triggerRefetchMembers,
      refetchPaymentsId,
      triggerRefetchPayments
    }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMembers() {
  const context = React.useContext(MemberContext);
  if (context === undefined) {
    throw new Error("useMembers must be used within a MemberProvider");
  }
  return context;
}
