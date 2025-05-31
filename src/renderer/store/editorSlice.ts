import { createSlice } from '@reduxjs/toolkit';

const editorSlice = createSlice({
  name: 'editor',
  initialState: {
    isOpen: false,
    hasUnsavedChanges: false,
    // ...altri stati
  },
  reducers: {
    setEditorOpen(state, action) {
      state.isOpen = action.payload;
    },
    setEditorModified(state, action) {
      state.hasUnsavedChanges = action.payload;
    },
    // ...altro
  }
});

export const { setEditorOpen, setEditorModified } = editorSlice.actions;
export default editorSlice.reducer;
