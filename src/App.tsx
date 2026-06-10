import { Routes, Route, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { GeneratePage } from "./features/videos/GeneratePage";
import { VideoListPage } from "./features/videos/VideoListPage";
import { GENERATE_PATH, TABS } from "./features/videos/tabs";
import { AuthGuard } from "./features/auth/AuthGuard";
import { SignInPage } from "./features/auth/SignInPage";

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/pending" replace />} />
          <Route path={GENERATE_PATH} element={<GeneratePage />} />
          {TABS.map((tab) => (
            <Route
              key={tab.key}
              path={tab.path}
              element={<VideoListPage tab={tab} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/pending" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
