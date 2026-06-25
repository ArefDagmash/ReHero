import { useState } from "react";
import Reader from "@/components/Reader";
import HomePage from "@/components/HomePage";
import HighlightMenu from "@/components/HighlightMenu";
import ImageSearchPanel from "@/components/ImageSearchPanel";
import { useAppStore } from "@/store/useAppStore";

function App() {
  const [view, setView] = useState<"home" | "reader">("home");

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden relative flex">
        {view === "home" ? (
          <HomePage onOpenPaper={() => setView("reader")} />
        ) : (
          <Reader
            onBack={() => {
              setView("home");
              useAppStore.setState({ activePaperPath: null });
            }}
          />
        )}
      </div>

      <HighlightMenu />
      <ImageSearchPanel />
    </div>
  );
}

export default App;
