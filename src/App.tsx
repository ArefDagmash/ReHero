import { useCallback, useState } from "react";
import { PanelLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import Library from "@/components/Library";
import Reader from "@/components/Reader";
import HighlightMenu from "@/components/HighlightMenu";
import { log } from "@/lib/logger";

function App() {
  const [libraryOpen, setLibraryOpen] = useState(true);

  const toggleLibrary = useCallback(() => {
    log.app.info("Toggle library sidebar", { open: !libraryOpen });
    setLibraryOpen((v) => !v);
  }, [libraryOpen]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-1 overflow-hidden relative">
        {libraryOpen && (
          <>
            <aside className="w-72 shrink-0 overflow-hidden bg-background">
              <Library />
            </aside>
            <Separator orientation="vertical" />
          </>
        )}

        <Reader />

        {/* Library toggle */}
        <button
          onClick={toggleLibrary}
          className="fixed bottom-4 left-4 z-50 p-2 rounded-full bg-background/60 hover:bg-background/80 border border-border backdrop-blur-sm"
          title={libraryOpen ? "Close library" : "Open library"}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <HighlightMenu />
    </div>
  );
}

export default App;
