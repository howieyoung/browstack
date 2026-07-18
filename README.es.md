# Browstack

[English](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md)

**Browser + Substack** — convierte tu propio historial de navegación en un digest semanal personal, bellamente diseñado y con la privacidad como prioridad, entregado en tu bandeja de entrada como un auténtico newsletter.

<p align="center">
  <img src="docs/images/sample-cover.jpg" width="420" alt="Portada de muestra generada por el motor, en la tradición ilustrada de The New Yorker" />
  <br/>
  <em>Cada número recibe una portada recién generada en la tradición ilustrada de The New Yorker,<br/>inspirada en lo que realmente leíste esa semana.</em>
</p>

## Por qué

Abres artículos desde las redes todo el día, nunca los terminas, y se acumulan en marcadores que jamás volverás a visitar. La idea central de Browstack: **navegar ya es la entrada de datos**. Tu historial ya vive en tu máquina — no hace falta ningún botón de "guardar". Browstack lo lee localmente, conserva solo el contenido de conocimiento, resume cada pieza lo bastante bien como para sustituir la relectura, y lo maqueta en un número semanal digno de conservar.

**Tú eres tu propio editor.** Cada número es privado por defecto — publicar algo hacia fuera es siempre un opt-in explícito, pieza por pieza.

> ### ⚡ La ruta más rápida: tu número №0 en tres minutos
>
> ```bash
> git clone https://github.com/howieyoung/browstack.git && cd browstack
> npm install                          # creates your personal config file
> claude /login                        # use your Claude subscription as the LLM (or an API key)
> npm run ingest && npm run enrich && npm run preview
> open out/browstack-issue-0.html      # your preview issue!
> ```
>
> Estos cinco pasos no requieren **ninguna API key de pago**: tu historial de Chrome existente, el CLI de Claude Code (sin clave extra) y una portada por defecto incluida. Añade la portada generada por IA (OpenAI) y la entrega por correo (Gmail) más tarde con las guías de configuración de abajo.

### 🤖 O deja que tu agente de IA lo configure todo

Tras clonar, abre **Claude Code** (o Codex, o cualquier coding agent) dentro de esta carpeta y dile:

> **«Escanea este proyecto y guíame en la configuración.»**

El repositorio incluye [AGENTS.md](AGENTS.md) — un manual paso a paso que tu agente sigue para configurarlo todo *contigo*: configuración personal, login del LLM, tu primer número, claves de portada, entrega por Gmail, la extensión de Chrome y la programación semanal. También hace cumplir las reglas de privacidad (tus claves van al Keychain de macOS, nunca al chat).

## Cómo funciona

```
Chrome History ─┐
                ├→ classify → enrich → cover → render → send
Extension ──────┘   (knowledge   (LLM      (art     (nameplate,  (SMTP,
 (true reading       filter +     summar-   director  topics,      inline
  signals)           privacy      ies)      + image    summaries)   cover)
                     firewall)              engine)
```

- **Ingest** — lee la base de datos History local de Chrome (una copia — Chrome bloquea la original). Con Chrome Sync activado, la navegación de tu móvil se incluye automáticamente.
- **Extensión (MV3)** — cuenta los segundos de lectura *activa* (pestaña visible + interacción reciente) y captura el texto del artículo en el momento en que lo lees, incluso tras muros de login. Habla **solo con `127.0.0.1`** — nada sale jamás de tu máquina.
- **Classify** — regla dura: el contenido que no es de conocimiento (cotilleos, loterías, promociones, búsquedas rápidas) nunca entra en el número, por mucho que te quedaras. Las páginas sensibles (banca, correo, autenticación, servicios públicos) ni siquiera se almacenan.
- **Enrich** — un LLM escribe tres puntos + una conclusión por artículo, y una línea de contexto editorial por publicación social.
- **Cover** — un director de arte LLM destila la semana en una única metáfora visual, y un motor de imagen la pinta bajo una dirección artística fija (gouache plano, paleta limitada, generoso espacio negativo — sin texto en la obra).
- **Render & send** — cabecera de revista (número №, rango de fechas, logotipo, lema), resúmenes agrupados por tema, estadísticas semanales. Cada pieza muestra **cuánto tiempo la leíste esa semana** — la razón por la que fue elegida. Enviado por tu propio Gmail SMTP con la portada incrustada como adjunto CID.
- **Sin bucle de autoalimentación** — al enviarse un número, sus piezas quedan selladas (`published_in`) y no pueden reaparecer, aunque las revisites desde el propio digest.

## Principios de privacidad

1. **Local primero.** El análisis, filtrado y ranking ocurren en tu máquina. El único interlocutor de red de la extensión es `127.0.0.1`.
2. **Filtrar antes de cualquier llamada a la nube.** Solo el texto extraído de páginas clasificadas como contenido llega a un LLM. Las páginas de banca, correo, autenticación y administración nunca salen de la máquina — ni siquiera se escriben en la base de datos de Browstack.
3. **Los secretos viven en el Keychain de macOS**, no en dotfiles ni en exports de entorno.
4. **Publicar es opt-in pieza por pieza.** No existe ninguna vía de publicación automática.

## Requisitos

- macOS 13+ (se usan Keychain y `sips`; Linux/Windows requerirían pequeñas sustituciones)
- Google Chrome (Chrome Sync recomendado — incorpora la navegación móvil al digest)
- Node.js 20+
- Un LLM: [Claude Code CLI](https://claude.com/claude-code) (usa tu suscripción existente) **o** una API key de Anthropic
- Opcional: una API key de OpenAI (renderizado de portadas), una cuenta de Gmail (entrega por correo)

## Inicio rápido

```bash
git clone https://github.com/<you>/browstack.git
cd browstack
npm install                 # also creates src/shared/userConfig.ts from the template
$EDITOR src/shared/userConfig.ts   # your email, Chrome profile, personal noise domains

npm run ingest              # import & classify your Chrome history (local only)
npm run stats               # sanity check: classification stats + top candidates
npm run enrich              # LLM: knowledge filter + summaries  (see LLM setup below)
npm run cover               # generate this issue's cover        (see OpenAI setup below)
npm run preview             # writes out/browstack-issue-0.html — open it!
npm run send                # email the issue to yourself        (see Gmail setup below)
```

### Extensión (señales de lectura reales)

```bash
npm run build:ext
npm run serve               # local receiver on 127.0.0.1:8787 — keep it running
```

Luego abre `chrome://extensions` → activa el **Modo de desarrollador** → **Cargar descomprimida** → selecciona la carpeta `extension/`. Las páginas que lees activamente durante 30+ segundos se capturan (texto + profundidad de scroll + segundos activos) y aterrizan en la base de datos local. El popup muestra el estado del receptor y la longitud de la cola.

## Guías de configuración (una sola vez)

### 1 · Proveedor LLM

**Opción A — Claude Code CLI (por defecto, sin API key que gestionar):**

```bash
claude /login    # once, in a terminal
```

**Opción B — API de Anthropic:** pon `llm.provider: "anthropic"` en `src/config.ts` y exporta `ANTHROPIC_API_KEY`.

### 2 · Claves para la generación de portada (hazlo durante el onboarding)

**La portada es lo que hace que cada número se sienta vivo — configúrala.** Un clon recién hecho incluye una portada por defecto (`assets/cover-default.jpg`, el arte del número inaugural), así que nunca te quedas sin portada, pero **todos los números reutilizarían la misma imagen**. Para obtener una portada *única* generada a partir de la lectura real de cada semana, necesitas dos claves:

- **Un LLM** (el *director de arte*) — el Claude Code CLI o la API de Anthropic que ya configuraste en el paso 1. Lee los temas de la semana y diseña una metáfora visual + un prompt de imagen.
- **Una clave de OpenAI** (el *renderizador*) — convierte ese prompt en la ilustración final mediante `gpt-image-1`.

Sin la clave de OpenAI, Browstack recurre a que tu **LLM de suscripción dibuje él mismo la portada como ilustración SVG** (modelo más potente, alto esfuerzo de razonamiento) — cada número sigue teniendo su portada única. El renderizador de OpenAI simplemente produce arte raster más rico. La portada por defecto incluida es solo el último recurso.

En [platform.openai.com](https://platform.openai.com) crea un **proyecto dedicado + clave con límite de gasto mensual** (una imagen por semana cuesta muy poco — un límite de $10 es generoso). Luego guárdala en el Keychain — fíjate en el **espacio inicial**, que evita que el comando quede en el historial del shell:

```bash
 security add-generic-password -s browstack-openai -a "$USER" -w '<your-key>' -U
```

`npm run cover` la encuentra automáticamente (la variable de entorno `OPENAI_API_KEY` tiene prioridad si está definida). Nunca pongas claves en `~/.zshrc` — texto plano en disco, heredado por todos los procesos, y la sincronización de dotfiles es la vía clásica de fuga.

### 3 · Gmail SMTP para la entrega (Keychain de macOS)

Solo se hace una vez:

1. [Cuenta de Google → Seguridad → Verificación en dos pasos → Contraseñas de aplicación](https://myaccount.google.com/apppasswords) — genera una (el nombre da igual, p. ej. `browstack`).
2. En una terminal (fíjate en el espacio inicial):

```bash
 security add-generic-password -s browstack-smtp -a you@example.com -w '<16-char app password>' -U
```

3. `npm run send` — el número №0 llega a tu bandeja con la portada incrustada arriba. (Los clientes de correo rechazan imágenes `data:` URI pero aceptan adjuntos CID, que es lo que usa Browstack.)

### 4 · Automatización semanal (launchd)

Un solo comando programa la ejecución completa — `ingest → enrich → cover → send` — como LaunchAgent de macOS:

```bash
npm run schedule:weekly                        # every Saturday 08:17 by default
npm run schedule:weekly -- --day 1 --hour 9    # e.g. Mondays at 09:00 (--day 0–6, 0 = Sunday)
```

- Se ejecuta en tu sesión de usuario, así que el Keychain (secretos de LLM/OpenAI/SMTP) está disponible.
- Si tu Mac está dormido a la hora programada, launchd ejecuta el trabajo al despertar.
- Un fallo al renderizar la portada (p. ej. sin clave de OpenAI) no bloquea el número — se reutiliza la portada anterior.
- Un fallo transitorio del LLM tampoco mata la ejecución: la clasificación se reintenta una vez y el número sale con lo ya enriquecido. Nunca se envía un número vacío.
- La programación se dispara dos veces cada sábado (08:17 principal, 20:17 reintento); si el número ya salió, el reintento se omite automáticamente. Un fallo fatal lanza una notificación de macOS en lugar de fallar en silencio.
- Un latido diario de credenciales (09:37) mantiene fresca la sesión del CLI de Claude y te avisa con días de antelación si vuelve a hacer falta `claude /login`.
- Guardas de calidad integradas: los fragmentos de extracción (< 300 caracteres) y las publicaciones sociales duplicadas se degradan automáticamente; las búsquedas de enciclopedia/diccionario nunca califican.
- Logs: `data/logs/weekly.log`. Ejecución manual en cualquier momento: `npm run weekly`.
- Desinstalar: `launchctl bootout gui/$UID/com.browstack.weekly && rm ~/Library/LaunchAgents/com.browstack.weekly.plist`

### Números y archivo

Cada número está numerado y se conserva: №0 es el número de vista previa; a partir de ahí, cada número es simplemente №N — la progresión la lleva el propio número. Un `send` exitoso sella el número actual; la siguiente ejecución abre automáticamente uno nuevo con portada nueva. Los artefactos se acumulan en `out/` (versiones web + email por número) y `assets/covers/` (una portada por número), con un archivo navegable en `out/index.html`. Si la portada de una semana falla al renderizarse, se reutiliza la del número anterior.

## Principios editoriales

- **El conocimiento es una puerta dura.** Cotilleos de entretenimiento, loterías, promociones de compras, inscripciones a eventos y búsquedas rápidas tipo diccionario quedan excluidos sin importar el tiempo de permanencia.
- **Los resúmenes deben sustituir al original.** Tres puntos ≤ 42 caracteres + una conclusión ≤ 32 caracteres por artículo.
- **El número es un artefacto.** Paleta fija, cabecera serif, numeración de números — la belleza hace que lo abras, la calidad del contenido hace que lo termines.

## Hoja de ruta

- Scoring v2: señales de lectura activa en el ranking; normalización de temas
- UI de curación: elige piezas, añade tus propias opiniones, publica contenido seleccionado hacia fuera
- Destinos de publicación: lista propia vía SMTP/SendGrid, exportación a Ghost/Buttondown

## Licencia

[MIT](LICENSE)
