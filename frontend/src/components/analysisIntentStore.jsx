import { createContext, useContext, useMemo, useState } from "react";

const AnalysisIntentContext = createContext(null);

export function AnalysisIntentProvider({ children }) {
  const [analysisIntent, setAnalysisIntent] = useState({
    type: null,
    outcome: "",
    predictors: [],
    group: "",
    varA: "",
    varB: "",
    warnings: [],
    errors: {},
    note: "",
    intentLog: [],
  });

  const value = useMemo(() => ({
    analysisIntent,
    setAnalysisIntent,
  }), [analysisIntent]);

  return (
    <AnalysisIntentContext.Provider value={value}>
      {children}
    </AnalysisIntentContext.Provider>
  );
}

export function useAnalysisIntent() {
  const ctx = useContext(AnalysisIntentContext);
  if (!ctx) {
    throw new Error("useAnalysisIntent must be used within AnalysisIntentProvider");
  }
  return ctx;
}
