// scanVote.ts — filtro de consenso entre frames para el escáner.
//
// El diagnóstico de B-14 (ver AGENTS.md) terminó así: el descriptor no tiene
// margen de sobra, y una rotación equivocada puede puntuar *mejor* contra una
// carta ajena que la rotación correcta contra la carta buena. Con un solo
// frame no hay forma de distinguirlo — se midió, y ni el margen entre el 1º y
// el 2º sirve como señal.
//
// La idea que quedaba por probar: **el ruido no se repite**. Una coincidencia
// espuria depende de la iluminación, el encuadre y el temblor de la mano de
// ese frame concreto; un acierto real gana frame tras frame. En modo AUTO ya
// se procesa un frame nuevo cada ~1,5 s, así que exigir que el mismo código
// gane varias veces seguidas es gratis en código y sólo cuesta latencia.
//
// Módulo puro y sin estado global: el llamante crea un votante y lo tira al
// cerrar el escáner. Así es testeable sin cámara.

/** Un candidato tal como lo devuelve `matchTopK`. */
export interface ScanCandidate {
  code: string;
  suffix: string;
  score: number;
}

export interface VoterOptions {
  /** Victorias consecutivas necesarias para aceptar. 1 = sin filtro. */
  needed?: number;
  /**
   * Ventana en ms tras la cual una racha caduca. Si el usuario cambia de
   * carta, los votos viejos no deben sumarse a los nuevos; y una racha
   * interrumpida por dos frames sin lectura tampoco cuenta como continua.
   */
  windowMs?: number;
}

const DEFAULT_NEEDED = 2;
const DEFAULT_WINDOW_MS = 6000;

export interface ScanVoter {
  /**
   * Registra el resultado de un frame.
   *
   * @returns el candidato ganador si ya acumula suficientes votos, o `null`
   *          si aún no hay consenso (o el frame no dio nada).
   */
  vote(results: ScanCandidate[]): ScanCandidate | null;
  /** Descarta la racha en curso. Llamar tras aceptar una carta. */
  reset(): void;
  /** Votos acumulados por el líder actual — para pintar progreso en la UI. */
  streak(): number;
  /** Cuántos votos hacen falta en total. */
  needed: number;
}

export function createScanVoter(opts: VoterOptions = {}): ScanVoter {
  const needed = Math.max(1, opts.needed ?? DEFAULT_NEEDED);
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;

  let leader: ScanCandidate | null = null;
  let count = 0;
  let lastVoteAt = 0;

  const reset = () => {
    leader = null;
    count = 0;
    lastVoteAt = 0;
  };

  return {
    needed,
    reset,
    streak: () => count,
    vote(results) {
      if (!results.length) return null;
      const top = results[0];
      const now = Date.now();

      // El voto se cuenta por CÓDIGO BASE, no por variante: dos parallels de
      // la misma carta comparten arte y alternarse entre ellos frame a frame
      // no es desacuerdo, es la misma respuesta. Quién elige la variante es el
      // usuario, igual que en el resto del flujo del escáner.
      const sameCard = leader?.code === top.code;
      const withinWindow = now - lastVoteAt <= windowMs;

      if (sameCard && withinWindow) {
        count += 1;
        // Se conserva la lectura de MEJOR puntuación de la racha: es la que
        // vio la carta más limpia, y su sufijo es el más fiable.
        if (top.score > leader!.score) leader = top;
      } else {
        leader = top;
        count = 1;
      }
      lastVoteAt = now;

      if (count >= needed) {
        const winner = leader;
        reset();
        return winner;
      }
      return null;
    },
  };
}
