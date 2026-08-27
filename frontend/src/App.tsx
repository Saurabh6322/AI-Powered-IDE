import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CollaborationProvider } from "./contexts/CollaborationContext";
import IDELayout from "./components/IDELayout/IDELayout";

function App() {
  return (
    <ThemeProvider>
      <CollaborationProvider>
        <WorkspaceProvider>
          <IDELayout />
        </WorkspaceProvider>
      </CollaborationProvider>
    </ThemeProvider>
  );
}

export default App;
