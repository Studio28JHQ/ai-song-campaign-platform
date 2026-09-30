# SEO Audit — Mi primera Canción IA

> Auditoría técnica de solo lectura. Ningún archivo del producto fue modificado.
> Fecha: 2026-09-30 · Commit auditado: `9fdc3a0` · Evidencia: código fuente + HTML realmente servido por `next dev` en `http://localhost:3222/`.

---

## 1. Executive Summary

**La landing es técnicamente indexable y está mejor construida de lo habitual**: se sirve como Server Components, entrega ~630 palabras de texto real en el HTML inicial, declara `<meta name="robots" content="index, follow">`, tiene canonical absoluto, `robots.txt` y `sitemap.xml` dinámicos y JSON-LD válido. Un crawler sin JavaScript entiende perfectamente qué es el producto. **No hay ningún blocker de indexación.**

El problema no es la indexabilidad: es que **no hay nada que posicionar más allá de una sola URL**. El sitio es literalmente una página. El sitemap contiene una entrada. Hay **cero enlaces internos** — los únicos cuatro `<a>` de la página apuntan a `bassa.com.ec`. No existe arquitectura sobre la que construir tráfico orgánico.

Los tres hallazgos accionables más importantes: **falta `og:image`** (compartir la landing produce una vista previa sin imagen, mientras que las páginas de canción compartida sí la tienen); **el `<h1>` aparece en quinta posición**, después de un `h2` y tres `h3`; y **un vídeo de 4,8 MB en autoplay ocupa el above-the-fold** sin `poster`.

**Mayor riesgo:** depender de Ads indefinidamente, porque hoy no existe superficie orgánica que pueda crecer.
**Mayor oportunidad:** la landing ya tiene señales de calidad y un FAQ real de 8 preguntas; convertir eso en una arquitectura de intención es trabajo de contenido, no de refactor técnico.

---

## 2. Current Architecture

|                                |                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| Framework                      | Next.js **15.5.20**, React 19.1.0, App Router                                                 |
| Routing                        | `app/` — 16 `page.tsx`                                                                        |
| Landing                        | `app/page.tsx` — Server Component                                                             |
| Layout raíz                    | `app/layout.tsx` — `<html lang="es">`, `metadataBase`, JSON-LD                                |
| Páginas públicas indexables    | **1** — `/`                                                                                   |
| Páginas públicas no indexables | `/generate`, `/song`, `/song/share/[shareToken]`                                              |
| Páginas privadas               | `/admin/**` (12), tras `middleware.ts`                                                        |
| Sitemap                        | `app/sitemap.ts` — dinámico, **1 URL**                                                        |
| Robots                         | `app/robots.ts` — dinámico                                                                    |
| Metadata                       | `app/layout.tsx` (defaults + template) + `app/page.tsx` (overrides)                           |
| Rendering                      | **Server Components**; islas cliente: `RegistrationForm`, `GoogleTagManager`, `ConsentBanner` |
| i18n                           | **No existe**                                                                                 |
| Dominio                        | `NEXT_PUBLIC_APP_URL` (Producción: `https://miprimeracancion.bassa.com.ec`)                   |
| Imágenes                       | `next/image` con AVIF/WebP (`next.config.ts`)                                                 |
| Fuentes                        | `next/font` (Google + local) — self-hosted, sin FOUT externo                                  |

URL pública principal a posicionar: **`https://miprimeracancion.bassa.com.ec/`**

---

## 3. Critical Findings

| Prioridad | Problema                                       | Evidencia                                                                                                                                      | Impacto SEO                                                                                                                                                                                                                                                                                               | Recomendación                                                                                                                                         |
| --------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**    | **No hay `og:image`** en la landing            | `grep -c 'og:image' landing.html` → **0**. `twitter:card = summary`                                                                            | Compartir la landing en WhatsApp/Facebook/X produce una tarjeta sin imagen. CTR social bajo. Irónico: `/song/share/[token]` **sí** tiene `og:image`                                                                                                                                                       | Añadir `openGraph.images` en `app/layout.tsx` (existe `public/campaign/banners/banner-campaign.jpg`, 178 KB) y `twitter.card = "summary_large_image"` |
| **P1**    | **`<h1>` en quinta posición**                  | Orden real en el DOM: `h2 "Cómo funciona"` → 3×`h3` → `h1 "Una canción hecha con amor…"`                                                       | El primer encabezado que lee un crawler es un `h2` de una sección secundaria. Jerarquía rota                                                                                                                                                                                                              | Reordenar en `app/page.tsx`: `HeroSection` antes de `HowItWorks`                                                                                      |
| **P1**    | **Vídeo de 4,8 MB en autoplay above-the-fold** | `public/campaign/banners/banner-campaign-v2.mp4` = 4,8 MB, `<video autoplay loop muted playsinline>` sin `poster`, primer elemento de `<main>` | Riesgo alto de LCP y de consumo de datos en móvil. **No medido**                                                                                                                                                                                                                                          | Añadir `poster`, `preload="none"`, y evaluar versión comprimida o imagen estática en móvil                                                            |
| **P1**    | **Cero enlaces internos**                      | 4 `<a>` en toda la página, los 4 a `bassa.com.ec`                                                                                              | No hay arquitectura de enlazado. Ninguna página futura podrá recibir autoridad desde la landing                                                                                                                                                                                                           | Requisito previo a cualquier página SEO nueva                                                                                                         |
| **P2**    | **Sitemap con una sola URL**                   | `app/sitemap.ts` devuelve 1 entrada                                                                                                            | Nada más que descubrir. Techo estructural del canal orgánico                                                                                                                                                                                                                                              | Crecerá con la arquitectura de §7                                                                                                                     |
| **P2**    | `/song` en `Disallow` **y** `noindex` a la vez | `app/robots.ts` → `Disallow: /song`; la página de compartir emite `robots: noindex`                                                            | Un URL bloqueado no puede ser rastreado, así que Google **nunca lee el `noindex`**; si alguien publica el enlace en Facebook/X (que es exactamente su propósito), puede indexarse como URL desnuda. Además `facebookexternalhit` respeta `robots.txt`, así que **la vista previa social podría romperse** | Decidir uno de los dos mecanismos. Recomendado: quitar `/song` del `Disallow` y confiar en el `noindex` (que sí requiere rastreo) — ver §16           |
| **P2**    | JSON-LD mínimo                                 | `Organization` y `WebSite` solo con `name` + `url`                                                                                             | Se desaprovecha una entidad ya declarada                                                                                                                                                                                                                                                                  | Añadir `logo`, `sameAs`, `inLanguage`, `potentialAction`                                                                                              |
| **P2**    | FAQ real sin `FAQPage`                         | `Faq.tsx` — **8 pares pregunta/respuesta** reales                                                                                              | Rich result perdido con contenido genuino, sin inventar nada                                                                                                                                                                                                                                              | Añadir `FAQPage` generado desde el mismo array                                                                                                        |
| **P2**    | Sin `<header>` ni `<nav>`                      | Conteo en HTML servido: `header: 0`, `nav: 0`                                                                                                  | Sin landmarks de navegación; accesibilidad y comprensión estructural                                                                                                                                                                                                                                      | Se resuelve al introducir navegación (§7)                                                                                                             |
| **P3**    | Enlaces comerciales externos sin `rel`         | 3× "Comprar" → `bassa.com.ec/dermatologia/producto/…`                                                                                          | Fuga de autoridad hacia otro dominio                                                                                                                                                                                                                                                                      | Evaluar `rel="sponsored"`                                                                                                                             |
| **P3**    | Título y H1 no coinciden                       | `<title>` "Una canción personalizada para tu bebé \| Bassa" vs `<h1>` "Una canción hecha con amor, solo para tu bebé"                          | No es un error, pero el `h1` no contiene la keyword principal ("canción personalizada")                                                                                                                                                                                                                   | Alinear el `h1` con la intención                                                                                                                      |
| **P3**    | Fondos PNG de 2,3–2,9 MB                       | `background-ba-da-ba.png` 2,9 MB, +2 más                                                                                                       | Peso si se sirven sin `next/image`                                                                                                                                                                                                                                                                        | Verificar cuáles se usan y cómo                                                                                                                       |

---

## 4. Indexability Audit

| Punto          | Estado                 | Explicación                                                                                                                                                  |
| -------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| robots         | **PASS**               | `app/robots.ts` sirve `Allow: /` + `Sitemap:`. No bloquea CSS/JS. `Disallow` cubre `/admin`, `/api`, `/generate`, `/song` — correcto salvo el matiz de §3-P2 |
| sitemap        | **PASS (con reserva)** | `/sitemap.xml` válido, `lastmod`, `changefreq`, `priority`. Contiene **1 URL**: técnicamente correcto, estratégicamente vacío                                |
| canonical      | **PASS**               | `<link rel="canonical">` absoluto, HTTPS, sin parámetros, sin trailing slash, coherente con el sitemap. Derivado de `metadataBase`                           |
| HTTPS          | **PASS**               | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` en `next.config.ts`                                                                |
| status codes   | **PASS**               | `/` → 200. Token inválido en `/song/share/` → 404 correcto                                                                                                   |
| noindex        | **PASS**               | La landing emite explícitamente `index, follow`                                                                                                              |
| rendering      | **PASS**               | ~630 palabras, todos los encabezados y el JSON-LD presentes en el HTML inicial **sin ejecutar JavaScript**                                                   |
| crawlability   | **WARNING**            | La landing se rastrea sin problema, pero no hay rutas internas que seguir                                                                                    |
| internal links | **FAIL**               | Cero. Los 4 enlaces existentes salen del dominio                                                                                                             |

**Redirects:** `next.config.ts` no define `redirects()` ni `rewrites()`. La normalización `www`/no-`www` y HTTP→HTTPS depende de Vercel/DNS — **no verificable desde el código** (§11).

---

## 5. Technical SEO

**HTML y encabezados.** Un único `h1`, correcto y descriptivo, pero **en quinta posición**. Jerarquía real servida:

```
h2  Cómo funciona                    ← primer encabezado de la página
h3  Regístrate / La IA escribe… / La recibes…
h1  Una canción hecha con amor, solo para tu bebé
h3  Crea la canción de tu bebé
h3  Sensyderm… (×3)  +  h4 ×9
h2  Preguntas frecuentes
```

Semántica: `main` 1, `section` 5, `article` 3, `footer` 1 — razonable. Faltan `header` y `nav`.

**Metadata.** `<title>` 49 caracteres (bien), description 176 (en el límite alto, aceptable). Ambos únicos y descriptivos. `metadataBase` correcto, `title.template` definido para futuras páginas. **Falta `og:image`.**

**Imágenes.** 6 `<img>`, **todas con `alt` descriptivo**, servidas por `next/image` con AVIF/WebP. Las dos primeras eager (correcto, above-the-fold), el resto `loading="lazy"`. Bien resuelto.

**Structured data.** `Organization` + `WebSite`, válidos pero mínimos.

**JavaScript.** Solo tres islas cliente; el resto es servidor. Excelente base.

**URLs.** Limpias, en español, sin parámetros ni IDs.

---

## 6. Content & Search Intent

**Producto real según el código:** canciones personalizadas para **bebés**, generadas con IA, **gratuitas**, entregadas por correo, dentro de una campaña de marca de **Bassa / Sensyderm** (productos dermatológicos infantiles). Esto acota mucho la intención — no es un generador musical genérico.

**Keyword principal potencial:** _canción personalizada para bebé_.

**Clusters secundarios coherentes con el producto:**

- canción personalizada con IA · crear canción con nombre
- canción para bebé recién nacido · canción de cuna personalizada
- regalo para baby shower · regalo para recién nacido
- canción con el nombre de mi bebé

**Clusters que NO corresponden** y no deben forzarse: cumpleaños adultos, aniversarios de pareja, canciones para mamá/papá, generación musical profesional. El producto no los cubre.

**Intención primaria: transaccional** (registrarse y obtener la canción), con un componente de _commercial investigation_ ("¿es gratis?", "¿cuánto tarda?") que el FAQ ya responde.

**Gap principal:** no existe contenido _informational_. Todo el texto está escrito para convertir. No hay ninguna superficie que capte búsquedas de la fase de descubrimiento.

---

## 7. SEO Architecture Recommendation

Propuesta **conservadora**: solo páginas que puedan sostener contenido único y real.

```
/                                   landing (transaccional)
├── /como-funciona                   proceso, IA, tiempos, privacidad
├── /ejemplos                        canciones de muestra reales
├── /canciones-para-bebes            intención principal
├── /canciones-personalizadas-con-ia intención tecnológica
├── /regalo-para-recien-nacido       intención de regalo
└── /blog/                           contenido informacional
```

**Descartadas por no corresponder al producto:** `/canciones-de-cumpleanos`, `/canciones-para-aniversario`, `/canciones-para-mama`, `/canciones-para-papa`. Crearlas sería thin content sobre algo que el producto no hace.

Requisitos por página: ≥400 palabras únicas, un `h1` propio, canonical propio, enlace desde y hacia la landing, y entrada en el sitemap. **Si una página no puede sostener contenido único, no debe existir.**

---

## 8. Content Strategy

```
Problema  →  Contenido educativo  →  Solución  →  Página comercial  →  Generación
```

Tres pilares, no cientos de artículos:

1. **Vínculo y música en la primera infancia** — por qué cantar al bebé, canciones de cuna, rutinas de sueño. _Informacional, alto volumen potencial, conecta con la marca._
2. **Cómo funciona la IA musical** — qué hace, qué no, privacidad de los datos del bebé. _Investigación comercial; refuerza E-E-A-T y responde objeciones reales._
3. **Regalos para recién nacidos** — listas, ideas, baby shower. _Comercial, enlaza directo a la landing._

Cada artículo debe enlazar a la landing con anchor descriptivo, nunca "haz clic aquí".

---

## 9. Trust / E-E-A-T

**Señales existentes:** `Organization` en JSON-LD · FAQ real de 8 preguntas · `LegalDisclaimer` · `ConsentBanner` con registro de consentimiento · marca real y verificable detrás (Bassa/Sensyderm) · enlace a política de privacidad.

**Señales ausentes:**

- **La política de privacidad y los términos viven en `bassa.com.ec`**, no en este dominio. Para Google, este sitio no tiene páginas legales propias.
- Sin página "quiénes somos" ni datos de contacto propios.
- **Sin ejemplos de canciones** — el producto genera audio y no hay ni una muestra pública. Es la señal de confianza más valiosa que falta, y el activo ya existe.
- Sin testimonios ni reseñas.
- Sin explicación de cómo se usa la IA ni qué pasa con los datos del bebé (relevante y sensible).

---

## 10. Performance Risks

### Riesgos potenciales detectados en código

| Riesgo                 | Evidencia                                                                                        | Nivel      |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| **LCP**                | Vídeo de **4,8 MB**, autoplay, sin `poster`, primer elemento de la página                        | **Alto**   |
| Peso de assets         | 3 PNG de fondo de 2,3–2,9 MB                                                                     | Medio      |
| Third-party: GTM       | `next/script` `afterInteractive`, condicionado a un `fetch` previo                               | Bajo-Medio |
| Third-party: Turnstile | `challenges.cloudflare.com/turnstile/v0/api.js`, cargado por `RegistrationForm` (above-the-fold) | Medio      |
| CLS                    | **Mitigado**: el `<video>` declara `width`/`height` y `next/image` reserva espacio               | Bajo       |
| JS de hidratación      | Solo 3 islas cliente                                                                             | Bajo       |

### Métricas que necesitan medición real

LCP, INP, CLS, TTFB, peso total transferido, tiempo de bloqueo. **No he medido ninguna** y no afirmo valores. Requieren PageSpeed Insights / Lighthouse / CrUX sobre el dominio de producción.

---

## 11. Google Search Console / External Validation

**Verificable desde el código (hecho en esta auditoría):** robots.txt, sitemap.xml, canonical, meta robots, HTML servido, encabezados, JSON-LD, alt, headers de seguridad, rendering sin JS.

**Requiere acceso externo — no verificado, no inventado:**

- Páginas realmente indexadas, cobertura y errores de rastreo
- Impresiones, CTR, posiciones, queries reales
- Core Web Vitals de campo (CrUX)
- Backlinks y autoridad de dominio
- Normalización `www`/no-`www` y HTTP→HTTPS a nivel DNS/Vercel
- Si `NEXT_PUBLIC_APP_URL` de Producción es efectivamente el dominio final en el HTML desplegado
- Validación de las tarjetas sociales (Facebook Sharing Debugger / X Card Validator)
- Si `facebookexternalhit` está siendo bloqueado por `Disallow: /song`

---

## 12. Recommended Roadmap

### Sprint 1 — Blockers

No hay blockers de indexación. Arreglos de mayor relación impacto/esfuerzo:

1. `og:image` + `twitter:card = summary_large_image`
2. Reordenar `HeroSection` antes de `HowItWorks` (el `h1` primero)
3. `poster` + `preload="none"` en el vídeo

### Sprint 2 — Technical SEO

4. `FAQPage` JSON-LD desde el array existente
5. Enriquecer `Organization` (`logo`, `sameAs`) y `WebSite`
6. Resolver la contradicción `Disallow: /song` vs `noindex`
7. `rel="sponsored"` en los enlaces "Comprar"
8. Comprimir vídeo y fondos

### Sprint 3 — Content Architecture

9. Páginas legales propias (privacidad, términos)
10. `/como-funciona` y `/ejemplos` con canciones reales
11. `<header>`/`<nav>` y enlazado interno
12. Sitemap dinámico sobre las rutas reales

### Sprint 4 — Organic Growth

13. `/blog` con los tres pilares
14. Páginas de intención (§7), una a una y solo con contenido único
15. Enlazado interno contenido → comercial

---

## 13. Files To Change

**Ninguno modificado en esta auditoría.**

| Archivo                                                                              | Cambio sugerido                                        | Prioridad | Motivo                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------- | ------------------------------------ |
| `app/layout.tsx`                                                                     | `openGraph.images`, `twitter.card`, enriquecer JSON-LD | P1/P2     | Vista previa social y entidad        |
| `app/page.tsx`                                                                       | Reordenar secciones (`HeroSection` primero)            | P1        | `h1` como primer encabezado          |
| `src/features/landing/components/CampaignBanner.tsx`                                 | `poster`, `preload`                                    | P1        | LCP                                  |
| `src/features/landing/components/Faq.tsx`                                            | Emitir `FAQPage` desde el array existente              | P2        | Rich result con contenido real       |
| `app/robots.ts`                                                                      | Resolver `/song` bloqueado + `noindex`                 | P2        | Indexación y vistas previas sociales |
| `app/sitemap.ts`                                                                     | Ampliar al crecer la arquitectura                      | P2        | Descubrimiento                       |
| `src/features/landing/components/CampaignProducts.tsx`                               | `rel="sponsored"`                                      | P3        | Fuga de autoridad                    |
| `public/campaign/banners/*.mp4`                                                      | Recomprimir                                            | P1        | Peso                                 |
| _(nuevos)_ `app/privacidad/`, `app/terminos/`, `app/como-funciona/`, `app/ejemplos/` | Crear                                                  | P2/P3     | E-E-A-T y superficie orgánica        |

---

## 14. Quick Wins

1. Añadir `og:image` — activo ya disponible (`banner-campaign.jpg`)
2. `twitter:card = summary_large_image`
3. Mover `HeroSection` delante de `HowItWorks`
4. `poster` en el `<video>`
5. `preload="none"` en el `<video>`
6. `FAQPage` JSON-LD (8 preguntas ya escritas)
7. `logo` y `sameAs` en `Organization`
8. `inLanguage: "es"` en `WebSite`
9. `rel="sponsored"` en los tres "Comprar"
10. Recomprimir el vídeo del banner

Ninguno requiere contenido nuevo ni decisiones de producto.

---

## 15. Risks / Don't Do

- **No crear páginas por keyword sin contenido único.** Es el riesgo principal de la propuesta §7.
- **No inventar `/canciones-de-cumpleanos`, `/canciones-para-mama`** y similares: el producto no las cubre y serían thin content.
- **No añadir schema que no corresponda** (`Product`, `Review`, `AggregateRating` sin reseñas reales) — es motivo de acción manual.
- **No bloquear CSS/JS en robots.txt**: hoy no ocurre y no debe empezar a ocurrir.
- **No indexar `/song/share/[token]`**: son páginas con el nombre de un bebé real.
- **No duplicar la landing** en variantes por keyword.
- **No meter keywords a presión** en el `h1` a costa de la claridad.
- **No usar `Disallow` y `noindex` sobre la misma ruta** esperando que se refuercen: se anulan.

---

## 16. Final Assessment

### ¿La landing es técnicamente posicionable?

**Sí.** Se rastrea, se indexa, se renderiza en servidor con contenido real, y tiene canonical, sitemap, robots y datos estructurados válidos. No hay ningún impedimento técnico para posicionar **esa URL**.

### ¿Qué impide actualmente crecer orgánicamente?

1. **Existe una sola página.** No hay superficie que pueda captar más de una intención.
2. **Cero enlaces internos** — no hay dónde distribuir autoridad.
3. **Sin contenido informacional**: todo está escrito para convertir.
4. **Señales de confianza incompletas**: legales en otro dominio, sin ejemplos de canciones.
5. **Falta `og:image`**, lo que penaliza la difusión social.
6. **Riesgo de rendimiento** por el vídeo de 4,8 MB.
7. **Jerarquía de encabezados desordenada.**

### ¿Está preparada la arquitectura para una estrategia SEO más grande?

**Sí, parcialmente — y con buenos cimientos.** El App Router, los Server Components, `metadataBase`, `title.template`, el sitemap dinámico y el `next/image` ya configurado significan que añadir páginas SEO es trabajo de contenido, no refactor. Lo que falta es exactamente lo que no existe todavía: las páginas, la navegación y el enlazado.

La única decisión de arquitectura pendiente es **dónde viven las páginas legales**: hoy apuntan a `bassa.com.ec`, y para E-E-A-T conviene que este dominio tenga las suyas.

### ¿Qué deberíamos implementar antes de aumentar la inversión en Ads?

1. **Los 10 quick wins** — horas de trabajo, cero contenido nuevo.
2. **Medición real** de Core Web Vitals sobre producción, y verificación en Search Console.
3. **Comprimir el vídeo**: afecta a conversión de Ads tanto como a SEO.
4. **Páginas legales propias** — confianza para usuario y buscador.
5. **`/ejemplos` con canciones reales** — la mejor señal de confianza disponible, y el activo ya existe.

Nada de esto es prerequisito de Ads, pero los puntos 1-3 **mejoran el rendimiento de Ads además del orgánico**, así que son los primeros en orden de retorno.

---

## Limitaciones de esta auditoría

- **No he medido ninguna métrica de rendimiento.** Todos los riesgos de §10 son inferencias de código, señaladas como tales.
- **No he consultado Search Console ni herramientas de keywords.** No hay ni un dato de volumen en este informe; los clusters de §6 salen del producto real, no de datos de búsqueda.
- **No he hecho investigación de SERP** (Fase 19 del prompt es opcional y requiere búsqueda externa); sin ella no afirmo nada sobre competencia.
- **El HTML auditado es de `next dev`**, no de producción. La estructura es la misma, pero el dominio de las URLs absolutas proviene del `.env` local (preview). Producción usa `https://miprimeracancion.bassa.com.ec`, verificado previamente en la configuración de Vercel.
- **No he verificado si `facebookexternalhit` está siendo bloqueado** por `Disallow: /song`. Es una hipótesis razonada, no una observación; se confirma en un minuto con el Sharing Debugger de Facebook.
