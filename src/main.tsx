import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";

import { ChakraProvider } from "@chakra-ui/react";
import { system } from "@/theme";
import { ColorModeProvider } from "@/components/ui/color-mode";
import "@/styles/utopia.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ChakraProvider value={system}>
      <ColorModeProvider>
        <App />
      </ColorModeProvider>
    </ChakraProvider>
  </React.StrictMode>,
);
