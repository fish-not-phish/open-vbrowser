import React from "react"
import { UserStateData } from "@/types/userData"

export const useUserState = (): [
  UserStateData, 
  React.Dispatch<React.SetStateAction<UserStateData>>
] => {
  const [user, setUser] = React.useState<UserStateData>({
    csrfToken: "",
    isLoggedIn: null,
    isLoading: true,
    isAdmin: false,
    canCreateWorkspaces: false,
    personalWorkspacesEnabled: false,
  })

  return [user, setUser]
}