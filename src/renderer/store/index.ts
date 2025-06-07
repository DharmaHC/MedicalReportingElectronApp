// src/store.ts
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import storage from "redux-persist/lib/storage"; // Default to localStorage
import authReducer from "./authSlice";
import filtersReducer from "./filtersSlice";
import registrationsReducer from "./registrationSlice";
import examinationReducer from "./examinationSlice";
import loadingReducer from "./loadingSlice";
import editorReducer from './editorSlice';

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["auth", "registrations", "exam", "filters"],
  blacklist: ['auth.pin'],
};

const rootReducer = combineReducers({
  auth: authReducer,
  filters: filtersReducer,
  registrations: registrationsReducer,
  exam: examinationReducer,
  loading: loadingReducer,
  editor: editorReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

// [MODIFICA] Usa store.getState
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
