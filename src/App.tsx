import Reader from "@/components/Reader";
import HomePage from "@/components/HomePage";
import SettingsPage from "@/components/SettingsPage";
import HighlightMenu from "@/components/HighlightMenu";
import ImageSearchPanel from "@/components/ImageSearchPanel";
import DrawingPanel from "@/components/DrawingPanel";
import ClarifyPanel from "@/components/ClarifyPanel";
import Sidebar from "@/components/Sidebar";
import XPToast from "@/components/XPToast";
import { useAppStore } from "@/store/useAppStore";

type View = "home" | "papers" | "books" | "settings" | "reader";

function App() {
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const activePaperPath = useAppStore((s) => s.activePaperPath);

  // ponytail: derived from persisted state, no local useState needed
  const view: View = activePaperPath ? "reader" : sidebarTab;

  const navigate = (id: string) => {
    setSidebarTab(id as typeof sidebarTab);
    useAppStore.setState({ activePaperPath: null, activeBookPath: null });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden relative flex">
        <Sidebar
          active={sidebarTab}
          onNavigate={navigate}
          view={view === "reader" ? "reader" : "home"}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {view === "home" && <HomePage variant="continue" onOpenPaper={() => {}} />}
          {view === "papers" && <HomePage variant="library" onOpenPaper={() => {}} />}
          {view === "books" && <HomePage variant="books" onOpenPaper={() => {}} />}
          {view === "settings" && <SettingsPage />}
          {view === "reader" && <Reader />}
        </div>
      </div>

      <HighlightMenu />
      <ImageSearchPanel />
      <DrawingPanel />
      <ClarifyPanel />
      <XPToast />
    </div>
  );
}

export default App;
