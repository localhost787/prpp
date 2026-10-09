// Synthetic presentation-only wait data. No FHIR reads, subscriptions, polling, or timing claims.
export const WAIT_COPY = Object.freeze({
  en: Object.freeze({
    heading: 'Why am I waiting?',
    severity: level => `Level ${level} of 5`,
    reason: 'People are seen by severity, not by arrival order.',
    peopleAhead: count => `${count} ${count === 1 ? 'person' : 'people'} ahead`,
    estimate: value => `Estimated wait (simulated): ${value}`,
    caution: 'This is an estimate. It may change if more serious cases arrive. If you feel worse, tell the reception desk.',
    loading: 'Loading wait information…',
    error: 'We could not load wait information.',
  }),
  es: Object.freeze({
    heading: '¿Por qué espero?',
    severity: level => `Nivel ${level} de 5`,
    reason: 'Se atiende por gravedad, no por orden de llegada.',
    peopleAhead: count => `${count} ${count === 1 ? 'persona antes' : 'personas antes'}`,
    estimate: value => `Espera estimada (simulada): ${value}`,
    caution: 'Es un estimado. Puede cambiar si llegan casos más graves. Si se siente peor, avise en recepción.',
    loading: 'Cargando información de espera…',
    error: 'No pudimos cargar la información de espera.',
  }),
});

export const WAIT_FIXTURES = Object.freeze({
  afterTriage: Object.freeze({
    stage: 'after-triage',
    task: Object.freeze({ triageLevel: 3, peopleAhead: 6, estimatedWait: '45–60 min' }),
  }),
  afterSamples: Object.freeze({
    stage: 'after-samples',
    task: Object.freeze({ triageLevel: 3, peopleAhead: 3, estimatedWait: '20–30 min' }),
  }),
});

const WAITING_STAGES = new Set(['after-triage', 'after-samples']);

export function createWaitModel({ language = 'en', state = 'ready', stage, task = {} } = {}) {
  const resolvedLanguage = Object.hasOwn(WAIT_COPY, language) ? language : 'en';
  const copy = WAIT_COPY[resolvedLanguage];
  if (state === 'loading') return { language: resolvedLanguage, status: 'loading', message: copy.loading, card: null };
  if (state === 'error') return { language: resolvedLanguage, status: 'error', message: copy.error, card: null };
  if (state === 'empty') return { language: resolvedLanguage, status: 'empty', message: null, card: null };

  const explicitPeople = Number.isInteger(task.peopleAhead) && task.peopleAhead >= 0;
  const explicitEstimate = typeof task.estimatedWait === 'string' && task.estimatedWait.trim().length > 0;
  const explicitLevel = Number.isInteger(task.triageLevel) && task.triageLevel >= 1 && task.triageLevel <= 5;
  if (!WAITING_STAGES.has(stage) || !explicitPeople || !explicitEstimate || !explicitLevel) {
    return { language: resolvedLanguage, status: 'empty', message: null, card: null };
  }

  return {
    language: resolvedLanguage,
    status: 'ready',
    message: null,
    card: {
      heading: copy.heading,
      triageLevel: task.triageLevel,
      triageLabel: copy.severity(task.triageLevel),
      reason: copy.reason,
      peopleAhead: task.peopleAhead,
      peopleAheadLabel: copy.peopleAhead(task.peopleAhead),
      estimatedWait: task.estimatedWait,
      estimatedWaitLabel: copy.estimate(task.estimatedWait),
      caution: copy.caution,
    },
  };
}

export function createWaitController(loadWait) {
  let generation = 0;
  let contextKey = null;
  let snapshot = createWaitModel({ state: 'empty' });
  return {
    getSnapshot: () => snapshot,
    changeContext(nextContextKey) {
      generation += 1;
      contextKey = nextContextKey;
      snapshot = createWaitModel({ state: 'empty' });
    },
    async open(nextContextKey, options = {}) {
      generation += 1;
      const requestGeneration = generation;
      contextKey = nextContextKey;
      snapshot = createWaitModel({ language: options.language, state: 'loading' });
      try {
        const result = await loadWait(options);
        if (requestGeneration !== generation || contextKey !== nextContextKey) return snapshot;
        snapshot = createWaitModel({ language: options.language, state: 'ready', ...result });
      } catch {
        if (requestGeneration === generation && contextKey === nextContextKey) {
          snapshot = createWaitModel({ language: options.language, state: 'error' });
        }
      }
      return snapshot;
    },
    close() {
      generation += 1;
      contextKey = null;
      snapshot = createWaitModel({ state: 'empty' });
    },
  };
}
