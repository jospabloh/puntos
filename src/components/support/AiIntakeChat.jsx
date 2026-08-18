import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { intakeTurn, briefToMarkdown, MAX_QUESTIONS } from '@/lib/aiIntake';

/**
 * AiIntakeChat — entrevista conversacional del "BA/PO experto".
 *
 * Hace preguntas de descubrimiento (una a la vez, adaptándose a las respuestas)
 * y al terminar muestra el brief estructurado. El usuario confirma y se escala el
 * ticket con la especificación lista para el desarrollador.
 *
 * @param {{
 *   kind: 'feature'|'bug',
 *   subject: string,
 *   description: string,
 *   onComplete: (brief: object) => void,   // el padre arma el body + envía
 *   onBack: () => void,
 *   saving?: boolean,
 * }} props
 */
export default function AiIntakeChat({ kind, subject, description, onComplete, onBack, saving = false }) {
  // messages: [{ role: 'ai'|'user', text, suggestions? }]
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]); // [{ question, answer }]
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(true);
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState(''); // pregunta a la que responderá el siguiente turno
  const scrollRef = useRef(null);
  const startedRef = useRef(false);

  const pushAi = (text, suggestions) => setMessages((m) => [...m, { role: 'ai', text, suggestions }]);

  // Corre un turno de la entrevista con el history dado.
  const runTurn = async (hist) => {
    setThinking(true);
    setError('');
    try {
      const res = await intakeTurn(kind, { subject, description, history: hist });
      if (res.done && res.brief) {
        setBrief(res.brief);
        pushAi('¡Listo! Preparé el resumen para el equipo. Revísalo y escálalo. 👇');
      } else {
        const text = res.question?.text || 'Cuéntame un poco más para poder ayudarte.';
        pushAi(text, res.question?.suggestions);
        // Guardamos el texto de la pregunta pendiente para emparejarla con la respuesta.
        setPendingQuestion(text);
      }
    } catch {
      setError('La IA no está disponible en este momento. Puedes escalar tu solicitud sin el asistente.');
    } finally {
      setThinking(false);
    }
  };

  // Arranque: primera pregunta a partir de la descripción inicial.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runTurn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll al último mensaje.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const submitAnswer = (raw) => {
    const answer = (raw ?? input).trim();
    if (!answer || thinking || brief) return;
    setMessages((m) => [...m, { role: 'user', text: answer }]);
    setInput('');
    const nextHistory = [...history, { question: pendingQuestion, answer }];
    setHistory(nextHistory);
    runTurn(nextHistory);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnswer(); }
  };

  return (
    <div className="flex flex-col" style={{ maxHeight: '70vh' }}>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-600" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Un asistente experto te hará unas preguntas para que el equipo pueda resolverlo más rápido.
          Máximo {MAX_QUESTIONS} preguntas.
        </p>
      </div>

      {/* Hilo de la conversación */}
      <div ref={scrollRef} className="min-h-[220px] flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'rounded-br-sm bg-violet-600 text-white'
                : 'rounded-bl-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'}`}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.role === 'ai' && i === messages.length - 1 && Array.isArray(m.suggestions) && m.suggestions.length > 0 && !brief && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.suggestions.map((s, j) => (
                    <button key={j} type="button" onClick={() => submitAnswer(s)} disabled={thinking}
                      className="rounded-full border border-violet-300 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-violet-50 disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Analizando…
            </div>
          </div>
        )}
      </div>

      {/* Brief final */}
      {brief && (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-emerald-300 bg-emerald-50 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Resumen para el equipo</p>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600 dark:text-slate-300">{briefToMarkdown(brief)}</pre>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Entrada / acciones */}
      <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
        {!brief ? (
          <>
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={thinking || !!error}
                placeholder="Escribe tu respuesta…"
                className="max-h-32 min-h-10 resize-none"
              />
              <Button onClick={() => submitAnswer()} disabled={thinking || !input.trim()} className="shrink-0 gap-1.5 bg-violet-600 hover:bg-violet-700" aria-label="Enviar respuesta">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex justify-between">
              <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-slate-500 dark:text-slate-400">
                <ArrowLeft className="h-4 w-4" /> Volver
              </Button>
              {error && (
                <Button variant="outline" size="sm" onClick={() => onComplete(null)} disabled={saving}>
                  Escalar sin asistente
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} className="flex-1">Ajustar</Button>
            <Button onClick={() => onComplete(brief)} disabled={saving} className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700">
              <CheckCircle2 className="h-4 w-4" /> {saving ? 'Escalando…' : 'Escalar a soporte'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
