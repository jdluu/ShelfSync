import { useState } from "react";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  return (
    <main className="container mx-auto p-4 dark:bg-slate-900 dark:text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-4">ShelfSync</h1>
      <p>Local Replica Sync Engine</p>
    </main>
  );
}

export default App;
