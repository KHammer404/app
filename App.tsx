import React from "react";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "./src/state/AppState";
import AppFrame from "./src/components/AppFrame";
import { MATERIAL_SYMBOLS } from "./src/icons/font";

export default function App() {
  const [ready, error] = useFonts({ MaterialSymbolsOutlined: MATERIAL_SYMBOLS });
  if (!ready && !error) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppFrame />
      </AppProvider>
    </SafeAreaProvider>
  );
}
