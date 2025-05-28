// src/index.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { Provider, useDispatch } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import store, { persistor } from "./store"; // Importiamo il persistor
import { setPin } from "./store/authSlice";

 // Componente “wrapper” per azzerare il PIN al primo render
 const Init: React.FC = () => {
   const dispatch = useDispatch();
   React.useEffect(() => {
     dispatch(setPin(null));
   }, [dispatch]);
   return <App />;
 };

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <Init />
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
