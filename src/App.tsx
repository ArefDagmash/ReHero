import { useCallback, useState } from "react";
import { Separator } from "@/components/ui/separator";
import Toolbar from "@/components/Toolbar";
import Library from "@/components/Library";
import Reader from "@/components/Reader";
import AnnotationPanel from "@/components/AnnotationPanel";
import HighlightMenu from "@/components/HighlightMenu";
import { log } from "@/lib/logger";

function App() {
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);

  const toggleLibrary = useCallback(() => {
    log.app.info("Toggle library sidebar", { open: !libraryOpen });
    setLibraryOpen((v) => !v);
  }, [libraryOpen]);

  const toggleAnnotations = useCallback(() => {
    log.app.info("Toggle annotations sidebar", { open: !annotationsOpen });
    setAnnotationsOpen((v) => !v);
  }, [annotationsOpen]);

  return (
    <div className="h-full flex flex-col">
      <Toolbar
        onToggleLibrary={toggleLibrary}
        onToggleAnnotations={toggleAnnotations}
        annotationsOpen={annotationsOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        {libraryOpen && (
          <>
            <aside className="w-60 shrink-0 overflow-hidden bg-background">
              <Library />
            </aside>
            <Separator orientation="vertical" />
          </>
        )}

        <Reader />

        {annotationsOpen && (
          <>
            <Separator orientation="vertical" />
            <aside className="w-80 shrink-0 overflow-hidden bg-background">
              <AnnotationPanel />
            </aside>
          </>
        )}
      </div>

      <HighlightMenu />
    </div>
  );
}

export default App;
