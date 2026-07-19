"use client";

import { useEffect, useState } from "react";

const MESSAGE_INTERVAL_MS = 6000;
const FADE_DURATION_MS = 300;

// `{{babyName}}` is interpolated at render time — see `LyricsGenerationWaitingMessages` below.
const MESSAGE_TEMPLATES = [
  "✨ Estamos conociendo un poquito mejor a {{babyName}} para que su canción sea única.",
  "🎵 Buscando las palabras perfectas para contar su historia.",
  "💜 Cada canción se escribe desde cero especialmente para ella.",
  "🌟 Queremos que cuando la escuches, sientas que fue creada solo para tu familia.",
  "🎶 Ajustando el ritmo y el estilo para que cada verso tenga vida.",
  "💫 La magia lleva un poquito de tiempo... pero vale la pena esperar.",
  "❤️ Estamos poniendo mucho cariño en cada línea de la canción.",
  "🎼 Muy pronto tendrás una canción que no existe para nadie más.",
  "✨ Ya queda muy poco. Estamos dando los últimos retoques.",
  "🎁 Gracias por esperar. Estamos creando un recuerdo que podrán conservar para siempre.",
] as const;

interface LyricsGenerationWaitingMessagesProps {
  babyName: string;
}

/**
 * Rotating reassurance messages shown below the existing generation
 * spinner while Claude produces the lyrics — a real, measured 15-35s
 * wait (see the Claude timeout/max_tokens investigations). Purely
 * informational; never affects generation itself.
 *
 * Starts at a fixed index (never `Math.random()`/`Date.now()`), so
 * server and client always render the same first message and no
 * hydration mismatch is possible — all rotation happens client-side,
 * after mount, via `setInterval`.
 */
export function LyricsGenerationWaitingMessages({
  babyName,
}: LyricsGenerationWaitingMessagesProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let fadeTimeout: ReturnType<typeof setTimeout> | undefined;

    const interval = setInterval(() => {
      setVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((current) => (current + 1) % MESSAGE_TEMPLATES.length);
        setVisible(true);
      }, FADE_DURATION_MS);
    }, MESSAGE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  }, []);

  const message = MESSAGE_TEMPLATES[index].replace("{{babyName}}", babyName);

  return (
    <p
      role="status"
      aria-live="polite"
      className="min-h-12 text-center text-sm text-muted-foreground transition-opacity duration-300 ease-in-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {message}
    </p>
  );
}
