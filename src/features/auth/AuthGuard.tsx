import { Navigate, Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { signOut } from "./api";
import { useAuth } from "./useAuth";

export function AuthGuard() {
  const { session, loading } = useAuth();

  const isOwnerQuery = useQuery({
    queryKey: ["isOwner"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_owner");
      if (error) throw error;
      return data as boolean;
    },
    enabled: !!session,
  });

  if (loading || (session && isOwnerQuery.isPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-slate-500">Loading…</span>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />;
  }

  if (isOwnerQuery.data === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-slate-700">
          Signed in as <span className="font-medium">{session.user.email}</span>
          , but this account is not authorized to access this dashboard.
        </p>
        <button
          onClick={() => void signOut()}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Sign out
        </button>
      </div>
    );
  }

  return <Outlet />;
}
