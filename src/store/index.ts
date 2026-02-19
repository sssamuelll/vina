import { configureStore } from '@reduxjs/toolkit';
import projectReducer from './projectSlice';
import editorReducer from './editorSlice';
import { undoMiddleware } from './undoMiddleware';

export const store = configureStore({
  reducer: {
    project: projectReducer,
    editor: editorReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredPaths: ['project.pieces', 'project.avatar'],
        ignoredActions: ['project/loadProject', 'project/restoreState'],
      },
    }).concat(undoMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
