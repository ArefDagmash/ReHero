import { useEffect } from "react";
import Reader from "@/components/Reader";
import HomePage from "@/components/HomePage";
import ExplorePage from "@/components/ExplorePage";
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

type View = "home" | "papers" | "books" | "explore" | "settings" | "reader";

function App() {
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const activePaperPath = useAppStore((s) => s.activePaperPath);
  const paperCount = useAppStore((s) => s.papers.length);
  const bookCount = useAppStore((s) => s.books.length);
  const isEmpty = paperCount === 0 && bookCount === 0;

  useEffect(() => {
    useAppStore.setState({ sidebarTab: "home", activePaperPath: null, activeBookPath: null });
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
