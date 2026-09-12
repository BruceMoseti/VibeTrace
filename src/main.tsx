import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { Dashboard } from "./pages/Dashboard";
import { NewEvaluation } from "./pages/NewEvaluation";
import { History } from "./pages/History";
import { Compare } from "./pages/Compare";
import { RunDetail } from "./pages/RunDetail";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "new", element: <NewEvaluation /> },
      { path: "history", element: <History /> },
      { path: "compare", element: <Compare /> },
      { path: "runs/:id", element: <RunDetail /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
