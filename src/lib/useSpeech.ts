import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal typing for the Web Speech API (not in TypeScript's DOM lib).
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type Ctor = new () => SpeechRecognitionLike

function getCtor(): Ctor | undefined {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in browser settings, or use keyboard dictation in the text box.',
  'service-not-allowed': 'Speech recognition is not available here. Use keyboard dictation in the text box instead.',
  'no-speech': "Didn't hear anything. Try again.",
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs an internet connection.',
}

export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal
  const supported = typeof window !== 'undefined' && !!getCtor()

  const stop = useCallback(() => recRef.current?.stop(), [])

  const start = useCallback(() => {
    const C = getCtor()
    if (!C) return
    setError('')
    setInterim('')
    finalRef.current = ''
    const rec = new C()
    rec.lang = 'en-IN'
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      setInterim(text)
      // Keep the latest transcript even if it never gets marked final (happens on iOS Safari).
      finalRef.current = text
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? `Speech error: ${e.error}`)
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
      const text = (finalRef.current || '').trim()
      if (text) onFinalRef.current(text)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('Could not start the microphone. Use the text box instead.')
    }
  }, [])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, interim, error, start, stop }
}
