
"use client";

import * as React from "react";
import Image from "next/image";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label"; // Using Label directly
import type { FormSchemaType } from "@/lib/schemas/member-schema";

interface UserPhotoUploadFieldProps {
  control: Control<FormSchemaType>;
  setValue: UseFormSetValue<FormSchemaType>;
}

export function UserPhotoUploadField({ control, setValue }: UserPhotoUploadFieldProps) {
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const userPhotoFormValue = useWatch({
    control,
    name: "userPhoto",
  });

  React.useEffect(() => {
    if (userPhotoFormValue) {
      if (userPhotoFormValue !== photoPreview) {
        setPhotoPreview(userPhotoFormValue);
      }
    } else {
      if (photoPreview) {
        setPhotoPreview(null);
        if (photoInputRef.current) {
          photoInputRef.current.value = "";
        }
      }
    }
  }, [userPhotoFormValue, photoPreview]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUri = reader.result as string;
        setPhotoPreview(dataUri);
        setValue("userPhoto", dataUri, { shouldValidate: true });
      };
      reader.readAsDataURL(file);
    } else {
      setPhotoPreview(null);
      setValue("userPhoto", "", { shouldValidate: true });
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setValue("userPhoto", "", { shouldValidate: true });
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center space-y-2 w-32 ml-4">
      {/* Direct Label-Input association for accessibility */}
      <Label htmlFor="userPhotoInputGlobal" className="sr-only">
        Member Photo
      </Label>
      <Image
        src={photoPreview || "https://placehold.co/100x100.png"}
        alt="Member Photo Preview"
        width={100}
        height={100}
        className="rounded-full border object-cover w-[100px] h-[100px]"
        data-ai-hint="profile avatar"
      />

      {/* Hidden file input, correctly associated with the Label above */}
      <input
        type="file"
        ref={photoInputRef}
        onChange={handlePhotoChange}
        accept="image/*"
        className="hidden"
        id="userPhotoInputGlobal"
      />

      {/* FormField for the userPhoto data URI string, mainly for displaying validation messages */}
      {/* This FormItem can be styled to take minimal space if no error, or adjust as needed */}
      <FormField
        control={control}
        name="userPhoto" // Matches the field in your Zod schema
        render={() => (
          <FormItem className="h-4 text-center"> {/* Adjusted for message display */}
            {/* No FormLabel or FormControl here, as the interaction is via the separate file input */}
            <FormMessage className="text-xs" /> {/* Displays validation errors for userPhoto data URI */}
          </FormItem>
        )}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => photoInputRef.current?.click()}
      >
        <Upload className="mr-2 h-4 w-4" /> Upload
      </Button>
      {photoPreview && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={handleRemovePhoto}
        >
          <X className="mr-2 h-3 w-3" /> Remove
        </Button>
      )}
    </div>
  );
}
