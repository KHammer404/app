import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "./src/state/AppState";
import AppFrame from "./src/components/AppFrame";
export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppFrame />
      </AppProvider>
    </SafeAreaProvider>
  );
}
