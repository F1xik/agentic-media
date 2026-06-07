import { Routes, Route } from "react-router";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { AuthGuard } from "./features/auth/AuthGuard";
import { SignInPage } from "./features/auth/SignInPage";

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
