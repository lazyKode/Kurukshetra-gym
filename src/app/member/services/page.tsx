"use client";

import * as React from "react";
import Link from "next/link"; // Retained for potential direct use
import { useRouter } from "next/navigation";
import { LogOut, FileText, Utensils, Dumbbell, ShieldCheck, ShoppingCart, ArrowLeft, CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from "@/components/ui/sidebar"; // Retained imports
import { useToast } from "@/hooks/use-toast";

interface ServiceOption {
  title: string;
  description: string;
  icon: React.ElementType;
  link?: string; // Link remains optional for flexibility
  action?: () => void; // For non-navigation actions
}

const serviceOptions: ServiceOption[] = [
  { title: "Paid Diet Plans", description: "Customized diet plans from experts.", icon: Utensils, link: "/member/services/paid-diet-plans" },
  { title: "Free Diet Plans", description: "General diet plans for various goals.", icon: Utensils, link: "/member/services/free-diet-plans" },
  { title: "Paid Schedules", description: "Personalized workout schedules.", icon: Dumbbell, link: "/member/services/paid-schedules" },
  { title: "Free Schedules", description: "Standard workout routines.", icon: Dumbbell, link: "/member/services/free-schedules" },
  { title: "Paid Personal Training", description: "One-on-one sessions with certified trainers.", icon: ShieldCheck, link: "/member/services/personal-training" },
  { title: "Supplements Store", description: "Browse and purchase quality supplements.", icon: ShoppingCart, link: "/member/store/supplements" },
];

export default function MemberServicesPage() {
  const router = useRouter();
  const { toast } = useToast();

  const handleServiceClick = (option: ServiceOption) => {
    if (option.link) {
      router.push(option.link);
    } else if (option.action) {
      option.action();
    } else {
      toast({
        title: "Coming Soon!",
        description: `${option.title} will be available soon.`,
        variant: "default",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Button 
        onClick={() => router.back()} 
        variant="outline" 
        className="mb-6 flex items-center"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <h1 className="text-3xl font-bold mb-8 text-center">Our Services</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {serviceOptions.map((option) => (
          <Card 
            key={option.title} 
            onClick={() => handleServiceClick(option)}
            className="cursor-pointer hover:shadow-lg transition-shadow duration-200 ease-in-out flex flex-col"
          >
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center text-xl">
                <option.icon className="mr-3 h-7 w-7 text-primary" />
                {option.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
              <p className="text-muted-foreground">{option.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* 
        The following is a placeholder to show how other icons could be used.
        You can integrate these into actual UI elements like a footer or specific service items.
      <footer className="mt-12 border-t pt-6 text-center text-sm text-muted-foreground">
        <p className="mb-2">
          Manage your <Link href="/member/payment" className="text-primary hover:underline">Payments <CreditCard className="inline h-4 w-4"/></Link>
        </p>
        <p className="mb-2">
          View your <Link href="/member/reports" className="text-primary hover:underline">Reports <FileText className="inline h-4 w-4"/></Link>
        </p>
        <Button variant="ghost" size="sm" onClick={() => {
          toast({ title: "Logout Initiated (Placeholder)"});
          // Implement actual logout logic, e.g., router.push('/logout');
        }}>
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </footer> 
      */}
    </div>
  );
}
