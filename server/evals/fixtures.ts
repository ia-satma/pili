export interface EvalFixture {
  name: string;
  description: string;
  mode: "BRAINSTORM" | "DECIDE" | "RISKS" | "NEXT_ACTIONS";
  message: string;
  initiativeId?: number;
  expectedBehavior: {
    shouldHaveEvidence: boolean;
    shouldHaveIdeas: boolean;
    shouldHaveRisks: boolean;
    shouldHaveNextActions: boolean;
    shouldAskQuestions: boolean;
  };
}

export const EVAL_FIXTURES: EvalFixture[] = [
  {
    name: "evidence_complete",
    description: "Prueba con contexto de proyecto completo",
    mode: "BRAINSTORM",
    message: "¿Cómo podemos mejorar el progreso de esta iniciativa?",
    initiativeId: 1,
    expectedBehavior: {
      shouldHaveEvidence: true,
      shouldHaveIdeas: true,
      shouldHaveRisks: false,
      shouldHaveNextActions: false,
      shouldAskQuestions: false,
    },
  },
  {
    name: "evidence_missing",
    description: "Prueba sin contexto de proyecto - debe indicar evidencia insuficiente",
    mode: "DECIDE",
    message: "¿Debemos continuar con el proyecto?",
    initiativeId: undefined,
    expectedBehavior: {
      shouldHaveEvidence: false,
      shouldHaveIdeas: false,
      shouldHaveRisks: false,
      shouldHaveNextActions: false,
      shouldAskQuestions: true,
    },
  },
  {
    name: "open_alerts_high",
    description: "Prueba modo RISKS para detectar alertas",
    mode: "RISKS",
    message: "¿Cuáles son los principales riesgos actuales?",
    initiativeId: 1,
    expectedBehavior: {
      shouldHaveEvidence: true,
      shouldHaveIdeas: false,
      shouldHaveRisks: true,
      shouldHaveNextActions: false,
      shouldAskQuestions: false,
    },
  },
  {
    name: "conflicting_deltas",
    description: "Prueba para analizar cambios recientes conflictivos",
    mode: "DECIDE",
    message: "Hay cambios frecuentes en las fechas, ¿qué recomiendas?",
    initiativeId: 1,
    expectedBehavior: {
      shouldHaveEvidence: true,
      shouldHaveIdeas: true,
      shouldHaveRisks: true,
      shouldHaveNextActions: true,
      shouldAskQuestions: false,
    },
  },
  {
    name: "benefits_missing",
    description: "Prueba modo NEXT_ACTIONS sin beneficios definidos",
    mode: "NEXT_ACTIONS",
    message: "¿Cuáles son los siguientes pasos para definir beneficios?",
    initiativeId: 1,
    expectedBehavior: {
      shouldHaveEvidence: true,
      shouldHaveIdeas: false,
      shouldHaveRisks: false,
      shouldHaveNextActions: true,
      shouldAskQuestions: true,
    },
  },
];
