import { AiSettingsProvider } from "./settings/AiSettingsContext.jsx";
import PlaywrightQualityStudio from "./studio/PlaywrightQualityStudio.jsx";

export default function App() {
  return (
    <AiSettingsProvider>
      <PlaywrightQualityStudio />
    </AiSettingsProvider>
  );
}
