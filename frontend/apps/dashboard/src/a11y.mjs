import { visitPresentation } from './visit.mjs';

export function visitSpeechText(options = {}) {
  if (options.permissions?.visita !== true) return null;
  const visit = options.visit;
  if (!visit) return null;
  const presentation = visitPresentation(visit, options.permissions, 'es');
  const description = visit.stage === 5 && options.permissions.estudios === true
    ? 'Le están haciendo estudios. Los resultados le llegarán aquí.'
    : presentation.description;
  return `${description} Qué sigue: ${presentation.next}`;
}

export function speakVisit(options = {}) {
  if (options.permissions?.visita !== true) return false;
  const text = visitSpeechText(options);
  const speech = options.speech ?? globalThis.speechSynthesis;
  const Utterance = options.Utterance ?? globalThis.SpeechSynthesisUtterance;
  if (!text || !speech?.speak || typeof Utterance !== 'function') return false;
  speech.cancel?.();
  const utterance = new Utterance(text);
  utterance.lang = 'es-PR';
  speech.speak(utterance);
  return true;
}

export function cancelSpeech(speech = globalThis.speechSynthesis) {
  speech?.cancel?.();
}
