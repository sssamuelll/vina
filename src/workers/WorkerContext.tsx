import React, { createContext, useContext, useState, useEffect } from 'react';
import { PathCommand } from '../types/types';

type WorkerData = { pathCommands: PathCommand[], requiresOptimization: boolean };

type WorkerContextType = {
  isWorkerReady: boolean;
  worker: Worker | null;
  sendToWorker: (data: WorkerData) => void;
};

const WorkerContext = createContext<WorkerContextType>({
  isWorkerReady: false,
  worker: null,
  sendToWorker: () => {}
});

export const WorkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [isWorkerReady, setisWorkerReady] = useState(false);

  useEffect(() => {
    const newWorker = new Worker(
      new URL('./pathOptimizer.worker.ts', import.meta.url),
      { type: 'module' }
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'ready') {
        setisWorkerReady(true);
      }
    };

    newWorker.addEventListener('message', handleMessage);
    newWorker.postMessage('init');
    setWorker(newWorker);

    return () => {
      newWorker.removeEventListener('message', handleMessage);
      newWorker.terminate();
      setisWorkerReady(false);
    };
  }, []);

  const sendToWorker = (data: WorkerData) => {
    if (worker && isWorkerReady) {
      worker.postMessage(data);
    }
  };

  return (
    <WorkerContext.Provider value={{ isWorkerReady, worker, sendToWorker }}>
      {children}
    </WorkerContext.Provider>
  );
};

export const useWorker = () => useContext(WorkerContext);