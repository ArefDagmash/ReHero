import { useEffect } from "react";
import Reader from "@/components/Reader";
import HomePage from "@/components/HomePage";
import ExplorePage from "@/components/ExplorePage";
import AchievementsPage from "@/components/AchievementsPage";
import LandingPage from "@/components/LandingPage";
import SettingsPage from "@/components/SettingsPage";
import HighlightMenu from "@/components/HighlightMenu";
import ImageSearchPanel from "@/components/ImageSearchPanel";
import DrawingPanel from "@/components/DrawingPanel";
import ClarifyPanel from "@/components/ClarifyPanel";
import AnnotationPanel from "@/components/AnnotationPanel";
import SearchPanel from "@/components/SearchPanel";
import Sidebar from "@/components/Sidebar";
import XPToast from "@/components/XPToast";
import { useAppStore } from "@/store/useAppStore";
import { indexLibraryInBackground } from "@/lib/paperTextIndex";

type View = "home" | "papers" | "books" | "explore" | "achievements" | "settings" | "reader";

function App() {
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const paperCount = useAppStore((s) => s.papers.length);
  const bookCount = useAppStore((s) => s.books.length);
  const isEmpty = paperCount === 0 && bookCount === 0;
  const bgTheme = useAppStore((s) => s.bgTheme);

  // Applied here (always mounted) rather than per-page — it used to live
  // in a useEffect duplicated across Reader/HomePage/SettingsPage, so
  // landing directly on any page without that effect (e.g. Explore or
  // Achievements, or a refresh that restores straight into one of them)
  // never set the theme attribute at all, silently falling back to the
  // browser default (light).
  useEffect(() => {
    document.documentElement.dataset.theme = bgTheme;
  }, [bgTheme]);

  // One-time catch-up scan (mainly for papers added before full-text search
  // existed — new adds index themselves via addPaper.ts) — delayed so it
  // doesn't compete with the initial render/paint.
  useEffect(() => {
    const timer = setTimeout(() => {
      const { papers, books } = useAppStore.getState();
      indexLibraryInBackground([...papers, ...books]);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useAppStore.setState({ searchOpen: true });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const view: View = activePaperPath ? "reader" : sidebarTab;

  const navigate = (id: string) => {
    setSidebarTab(id as typeof sidebarTab);
    useAppStore.setState({ activePaperPath: null, activeBookPath: null });
  };

  const showLanding = view === "home" && isEmpty;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden relative flex">
        {!showLanding && (
          <Sidebar
            active={sidebarTab}
            onNavigate={navigate}
            view={view === "reader" ? "reader" : "home"}
          />
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showLanding && <LandingPage />}
          {view === "home" && !isEmpty && <HomePage variant="continue" onOpenPaper={() => {}} />}
          {view === "papers" && <HomePage variant="library" onOpenPaper={() => {}} />}
          {view === "books" && <HomePage variant="books" onOpenPaper={() => {}} />}
          {view === "explore" && <ExplorePage />}
          {view === "achievements" && <AchievementsPage />}
          {view === "settings" && <SettingsPage />}
          {view === "reader" && <Reader />}
        </div>
      </div>

      <HighlightMenu />
      <ImageSearchPanel />
      <DrawingPanel />
      <ClarifyPanel />
      <AnnotationPanel />
      <SearchPanel />
      <XPToast />
    </div>
  );
}

export default App;
