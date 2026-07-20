import React from "react";
import { UserStateData } from "./userData";

export interface AuthProps {
  (
    csrfToken: string, 
    setUser: React.Dispatch<React.SetStateAction<UserStateData>>,
    formData?: FormData
  ): Promise<void>;
}