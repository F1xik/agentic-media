import { Outlet } from "react-router";
import { useAuth } from "../features/auth/useAuth";
import { signOut } from "../features/auth/api";

export function Layout() {
  const { session } = useAuth();

  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">
            agentic-media
          </h1>
          <div className="flex items-center gap-4">
            {session && (
              <span className="text-sm text-slate-500">
                {session.user.email}
              </span>
            )}
            <button
              onClick={() => void signOut()}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
