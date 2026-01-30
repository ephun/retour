export function speak(text: string, lang: string): void {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  const voices = window.speechSynthesis.getVoices();
  const exactMatch = voices.find((v) => v.lang === lang);
  const partialMatch = voices.find(
    (v) => v.lang.split('-')[0] === lang.split('-')[0]
  );
  const voice = exactMatch ?? partialMatch;
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}
