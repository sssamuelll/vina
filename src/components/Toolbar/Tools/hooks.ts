import { useContext } from 'react';
import { ToolContext } from './ToolContext';
export const useTools = () => useContext(ToolContext);