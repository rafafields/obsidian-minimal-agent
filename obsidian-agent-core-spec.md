# Obsidian Agent Core — Spec técnico v1.0

Plugin minimalista para Obsidian que implementa un agente de IA con memoria
persistente y transparente. Todo el estado del agente —personalidad,
configuración, memoria— vive como archivos `.md` legibles y editables en el
vault. El usuario puede inspeccionar y modificar cualquier parte del sistema
directamente desde Obsidian.

---

## 1. Filosofía y alcance

### 1.1 Qué es este sistema

Un agente de propósito general con memoria a largo plazo, cuyo runtime es un
vault de Obsidian. La propuesta de valor frente a OpenClaw o Hermes es una
sola: **transparencia total**. No hay estado interno opaco. Lo que el agente
recuerda, cómo está configurado y qué va a persistir después de cada sesión
es visible, editable y auditables por el usuario en todo momento.

### 1.2 Qué no es este sistema

- No es un sistema de gestión de proyectos.
- No es un orquestador multi-agente.
- No tiene automatizaciones encadenadas.
- No clasifica memoria con embeddings ni vectorstores.

### 1.3 Principios de diseño

- **Markdown como source of truth.** El estado del agente no existe fuera del
  vault. Si el vault es legible, el sistema es auditable.
- **Nada se confirma sin que el humano lo vea.** Los candidatos de memoria
  pasan por una cola de revisión visible en el vault antes de confirmarse.
- **El contexto es determinista.** El `ContextAssembler` sigue un orden fijo
  con un token budget explícito. No hay inferencia difusa sobre qué cargar.
- **El vocabulario es cerrado.** El agente no puede crear tags nuevas de forma
  autónoma. Las tags siguen un vocabulario definido por el usuario en
  `taxonomy.md`.
- **Un agente, un vault.** El sistema asume un único agente por vault. No hay
  orquestación entre agentes.

---

## 2. Estructura del vault

```
_agent/
  soul.md           ← personalidad, valores, restricciones del agente
  user.md           ← modelo del usuario: estilo, preferencias, contexto
  taxonomy.md       ← vocabulario de tags autorizado
  memory/
    active.md       ← working memory (siempre inyectada)
    episodes/
      YYYY-MM-DD.md ← resumen de sesión por día
    items/
      _pending/     ← candidatos sin confirmar (state: draft)
        *.md
      *.md          ← items confirmados (state: active | stale | archived)

_system/
  traces/
    YYYY-MM-DDTHH-MM-{action}.md   ← trazas raw de llamadas API
```

El vault no contiene nada más por defecto. El usuario puede añadir carpetas
libremente —el plugin solo gestiona `_agent/` y `_system/`.

---

## 3. Archivos bootstrap invariantes

Estos cuatro archivos se inyectan en **todas** las llamadas al LLM sin
excepción. Son la identidad estable del sistema.

### 3.1 `_agent/soul.md`

Representa la postura estable del agente. El usuario lo edita libremente para
ajustar la personalidad, el tono o las restricciones. El agente nunca modifica
este archivo.

**Frontmatter:**

```yaml
---
kind: agent_soul
state: active
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
origin: hybrid
---
```

**Estructura del cuerpo (secciones H2):**

```markdown
## Core purpose
## Core values
## Conflicting priorities
## Epistemic stance
## Relationship with the user
## What this agent never does
## Voice and tone
```

### 3.2 `_agent/user.md`

Modela al usuario como contexto operativo. Adapta granularidad, estilo y
cadencia de las respuestas del agente. El agente puede proponer actualizaciones
a este archivo (como candidato en `_pending/`), pero nunca lo escribe
directamente.

**Frontmatter:**

```yaml
---
kind: agent_user
state: active
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
origin: hybrid
---
```

**Cuerpo recomendado:**

```markdown
## Forma de trabajar
## Preferencias de comunicación
## Áreas de interés actuales
## Patrones a evitar
## Contexto personal relevante
```

### 3.3 `_agent/taxonomy.md`

Registro del vocabulario de tags autorizado. El agente solo puede asignar tags
de la lista **Topics activos**. Puede sugerir nuevas tags en el JSON de
extracción, pero no las escribe directamente en este archivo.

**Frontmatter:**

```yaml
---
kind: agent_taxonomy
updated_at: YYYY-MM-DD
origin: human
---
```

**Estructura del cuerpo:**

```markdown
## Topics activos

#topic/trabajo
#topic/personal
#topic/aprendizaje

## Propuestas pendientes

#topic/finanzas — sugerida 2026-04-03, pendiente de aprobación
```

**Convención de tags:**

- Prefijo `#topic/` para temas (jerárquico, máximo un nivel de profundidad).
- Nombres en minúsculas, sin acentos, separados por guión si son compuestos:
  `#topic/desarrollo-web`.
- Máximo recomendado: 20 tags activas. Por encima de eso, revisar si alguna
  es redundante.
- El plugin añade automáticamente a **Topics activos** las tags aprobadas por
  el usuario al confirmar un `memory_item`.

### 3.4 `_agent/memory/active.md`

Working memory inmediata. Resumen vivo del estado actual del agente: en qué
está enfocado, qué decidió recientemente, qué bloqueos hay. El plugin la
actualiza sección por sección después de cada sesión, usando los headers H2
como anchors. El usuario puede editar cualquier sección libremente —el plugin
nunca sobreescribe el archivo completo.

**Frontmatter:**

```yaml
---
kind: memory_active
state: current
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DDTHH:MM
origin: hybrid
---
```

**Estructura canónica:**

```markdown
## Foco actual

[Qué está ocurriendo ahora mismo. 2-3 frases.]

## Decisiones recientes

- [[memory/items/nombre-del-item]] — resumen en una línea

## Bloqueos

[Si no hay bloqueos: "ninguno".]

## Siguiente paso

[La próxima acción concreta. Una sola cosa.]
```

---

## 4. Contrato de datos: `memory_item`

### 4.1 Frontmatter completo

```yaml
---
kind: memory_item
state: draft                        # draft | active | stale | archived
created_at: YYYY-MM-DDTHH:MM
updated_at: YYYY-MM-DDTHH:MM
origin: agent                       # agent | human | hybrid

memory_tier: working                # working | semantic
memory_kind: decision               # decision | insight | constraint
                                    # risk | summary | pattern
importance: medium                  # low | medium | high | critical
confidence: high                    # low | medium | high

tags:
  - "#topic/trabajo"

related_to: []                      # links a otros memory_items relacionados
expires_at:                         # ISO date opcional. Vacío = sin caducidad.
session_id: YYYY-MM-DD-session-N    # traza de origen
---
```

### 4.2 Definición de valores

**`memory_tier`**

| Valor | Qué representa | Vida esperada |
|---|---|---|
| `working` | Contexto relevante ahora, puede quedar obsoleto pronto | Días / semanas |
| `semantic` | Hecho duradero: decisión consolidada, patrón estable, constraint permanente | Semanas / meses |

**`memory_kind`**

| Valor | Qué captura |
|---|---|
| `decision` | Una elección tomada y su razonamiento |
| `insight` | Un aprendizaje no obvio sobre el dominio o el usuario |
| `constraint` | Una limitación real: tiempo, técnica, recursos |
| `risk` | Un riesgo identificado, con o sin mitigación |
| `summary` | Síntesis de un bloque de trabajo |
| `pattern` | Comportamiento o preferencia recurrente del usuario |

### 4.3 Estructura del cuerpo

```markdown
## Qué ocurrió / qué se aprendió

[2-4 frases. Legible sin contexto de sesión. Debe tener sentido leída
3 meses después.]

## Implicación

[Por qué importa. Qué cambia en cómo opera el agente o cómo trabaja
el usuario.]

## Contexto de origen

[Referencia breve: "extraído de sesión YYYY-MM-DD".]
```

---

## 5. Contrato de datos: `episode`

Resumen factual de una sesión. A diferencia de los `memory_item`, no pasa por
`_pending/` porque es una traza de lo que ocurrió, no una interpretación. Se
escribe directamente con `state: confirmed`.

**Ubicación:** `_agent/memory/episodes/YYYY-MM-DD.md`
Si hay varias sesiones en el mismo día, el plugin añade el contenido de la
segunda sesión al mismo archivo bajo un nuevo header H2 con timestamp.

**Frontmatter:**

```yaml
---
kind: memory_episode
state: confirmed
created_at: YYYY-MM-DDTHH:MM
updated_at: YYYY-MM-DDTHH:MM
origin: agent

session_id: YYYY-MM-DD-session-N
token_cost: 0
---
```

**Estructura del cuerpo:**

```markdown
## Sesión YYYY-MM-DD HH:MM

### Qué se intentó

[Una frase.]

### Qué se produjo

[Lista de cambios concretos.]

### Decisiones tomadas

[Bullet list. Solo las de consecuencia futura.]

### Preguntas abiertas

[Lo que quedó sin resolver.]
```

---

## 6. Flujo completo de una sesión

```
Usuario abre el panel de chat del plugin
         │
         ▼
ContextAssembler.assemble(tokenBudget)
  Capa 1 — Bootstrap (siempre, ~600 tokens)
    soul.md + user.md + taxonomy.md + active.md
  Capa 2 — Episódica (~400 tokens)
    episodes/hoy.md + episodes/ayer.md  (si existen)
  Capa 3 — Semántica (hasta agotar budget)
    memory/items/*.md  confirmados, ordenados por score
         │
         ▼
Llamada principal al LLM con contexto ensamblado
  → El agente responde al usuario
  → El plugin actualiza active.md (sección a sección)
         │
         ▼
Al cerrar la sesión: MemoryExtractor.extract(transcript)
  → Segunda llamada al LLM (prompt de extracción)
  → Genera candidatos JSON
  → Plugin escribe archivos .md en memory/items/_pending/
  → Plugin escribe episode del día en memory/episodes/
         │
         ▼
Usuario revisa _pending/ en Obsidian (vista memory-review.base)
  → Edita si procede → mueve a memory/items/   →  state: active
  → Borra si descarta                           →  registrado en traza
         │
         ▼
Plugin detecta cambios vía vault.on('rename') / vault.on('delete')
  → Actualiza índice interno de scoring
  → Si item importance: high|critical → actualiza active.md
  → Si item tiene proposed_tags → añade a taxonomy.md sección activos
```

---

## 7. Prompt de extracción post-sesión

### 7.1 System prompt

```
Eres un extractor de memoria estructurada. Tu única función es analizar una
sesión de conversación y determinar qué información merece persistirse como
memoria a largo plazo.

Operas con sesgo conservador: es mejor no extraer que extraer ruido.
Solo extrae lo que seguirá siendo relevante en 4 semanas.

Formato de salida: JSON array. No escribas nada fuera del JSON.
```

### 7.2 User prompt

```
## Configuración del agente

### Taxonomía de tags autorizadas
{contenido de taxonomy.md, sección "Topics activos"}

## Transcript de la sesión

{transcript completo}

## Instrucción

Analiza la sesión y extrae entre 0 y 5 memory_item candidates.

Para cada candidato:
{
  "title": "slug-descriptivo-kebab-case",
  "memory_kind": "decision|insight|constraint|risk|summary|pattern",
  "memory_tier": "working|semantic",
  "importance": "low|medium|high|critical",
  "confidence": "low|medium|high",
  "tags": ["#topic/x"],          // solo tags de la taxonomía. [] si ninguna encaja
  "proposed_tags": ["#topic/y"], // tags nuevas a proponer al usuario. [] si no hay
  "what": "2-4 frases. Legible sin contexto de sesión.",
  "implication": "Por qué importa para el agente o el usuario.",
  "expires_at": "YYYY-MM-DD o null"
}

Criterios de extracción:
EXTRAE si → se tomó una decisión con razonamiento explícito
EXTRAE si → se identificó una restricción real
EXTRAE si → emergió un insight no obvio sobre el dominio o el usuario
EXTRAE si → hay un riesgo concreto identificado
EXTRAE si → el usuario reveló una preferencia o patrón recurrente

NO EXTRAE si → es información efímera que solo vale para esta sesión
NO EXTRAE si → es contexto ya presente en soul.md o user.md
NO EXTRAE si → es una tarea o acción pendiente (no es memoria)
NO EXTRAE si → es resumen de lo que ocurrió en la sesión (eso es el episode)

Si no hay nada que merezca persistirse: []
```

### 7.3 Gestión del token budget del extractor

Antes de enviar el prompt de extracción:

1. Si el transcript supera 6.000 tokens, comprimir mensajes del usuario
   a sus primeras 2 frases por turno.
2. Mensajes del agente: comprimir a las últimas 3 frases por turno.
3. El transcript comprimido no debe superar 5.000 tokens.

---

## 8. ContextAssembler

### 8.1 Interfaz TypeScript

```typescript
interface ContextBlock {
  filePath: string;
  content: string;
  tokens: number;
  layer: 'bootstrap' | 'episodic' | 'semantic';
}

interface AssemblyResult {
  blocks: ContextBlock[];
  totalTokens: number;
  droppedItems: number; // items semánticos que no entraron por budget
}

interface ContextAssemblerOptions {
  tokenBudget: number;       // default: 8000
  episodeDaysBack: number;   // default: 2
  minImportance: 'low' | 'medium' | 'high' | 'critical'; // default: 'medium'
}

class ContextAssembler {
  async assemble(options: ContextAssemblerOptions): Promise<AssemblyResult>
}
```

### 8.2 Orden de ensamblado

```
1. Bootstrap (reservar siempre ~700 tokens)
   soul.md → user.md → taxonomy.md → active.md

2. Episódica (reservar hasta ~400 tokens)
   episodes/hoy.md → episodes/ayer.md
   Si no hay budget suficiente: cargar solo el de hoy.
   Si tampoco: omitir.

3. Semántica (resto del budget)
   Cargar memory/items/*.md (excluir _pending/ y state: archived)
   Ordenados por score descendente hasta agotar budget.
   droppedItems = items que no entraron.
```

### 8.3 Fórmula de scoring de items semánticos

```
score = importance_weight + tier_bonus - staleness_penalty

importance_weight:
  critical → 100
  high     →  75
  medium   →  40
  low      →  10

tier_bonus:
  semantic → +20
  working  →  +5

staleness_penalty = días_desde_updated_at × 0.5   (máximo: -30)
```

Items excluidos del scoring:
- `state: stale` o `state: archived`
- `expires_at` en el pasado → el plugin marca automáticamente `state: stale`
  antes de excluir

---

## 9. Memory gardening

La revisión y limpieza de memoria se apoya en Bases de Obsidian, sin UI
adicional del plugin.

### `memory-review.base` — Cola de candidatos pendientes

```
Filter: kind == "memory_item" AND state == "draft"
Sort: created_at desc
Columns: title, memory_kind, importance, confidence, tags, created_at
```

**Flujo de revisión:**
- El usuario abre un candidato, lo lee, edita si hace falta.
- Mover el archivo de `_pending/` a `items/` → confirmado.
- Borrar el archivo → descartado.
- El plugin detecta ambas acciones vía `vault.on('rename')` y
  `vault.on('delete')`.

### `memory-garden.base` — Limpieza periódica

```
Filter: kind == "memory_item" AND state IN ["active", "stale", "working"]
Sort: updated_at asc
Columns: title, memory_kind, importance, memory_tier, tags, updated_at, expires_at
```

El usuario opera directamente sobre el frontmatter desde esta vista:
cambiar `state`, añadir `expires_at`, archivar. El plugin nunca revierte
cambios manuales.

---

## 10. Hooks del vault (TypeScript)

```typescript
// Confirmación de candidato: usuario movió archivo de _pending/ a items/
this.registerEvent(
  this.app.vault.on('rename', (file, oldPath) => {
    if (!oldPath.includes('memory/items/_pending/')) return;

    const cache = this.app.metadataCache.getFileCache(file);
    memoryManager.confirmItem(file.path, cache);

    // Si el item tiene proposed_tags, añadirlas a taxonomy.md
    const proposed = cache?.frontmatter?.proposed_tags ?? [];
    if (proposed.length > 0) {
      taxonomyManager.addToActive(proposed);
    }
  })
);

// Descarte de candidato: usuario borró archivo de _pending/
this.registerEvent(
  this.app.vault.on('delete', (file) => {
    if (!file.path.includes('memory/items/_pending/')) return;
    traceManager.recordDiscard(file.path);
  })
);

// Edición de item confirmado: reindexar score
this.registerEvent(
  this.app.vault.on('modify', (file) => {
    if (!file.path.includes('memory/items/')) return;
    if (file.path.includes('_pending/')) return;
    memoryManager.reindex(file.path);
  })
);
```

---

## 11. Configuración del plugin

La configuración sensible no vive en el vault. Se gestiona mediante formulario
en los ajustes del plugin de Obsidian.

**Parámetros mínimos del MVP:**

| Parámetro | Tipo | Default |
|---|---|---|
| `apiKey` | string (oculto) | — |
| `modelSlug` | string | `openai/gpt-4o` |
| `contextTokenBudget` | number | 8000 |
| `episodeDaysBack` | number | 2 |
| `minImportanceForContext` | enum | `medium` |
| `requireConfirmBeforeWrite` | boolean | true |
| `traceRetentionDays` | number | 30 |
| `autoArchiveExpiredItems` | boolean | true |

---

## 12. Plugins de Obsidian recomendados

El vault funciona sin plugins adicionales. Los siguientes extienden la
experiencia de forma nativa y sin dependencias externas:

| Plugin | Para qué | Tipo |
|---|---|---|
| **Bases** (nativo) | Vistas de revisión y gardening sobre memory_items | Core |
| **Properties** (nativo) | Edición visual de frontmatter | Core |
| **Templater** (community) | Plantillas para crear memory_items manuales | Opcional |

---

## 13. Wizard de instalación

En la primera ejecución el plugin lanza un wizard de cuatro pasos:

1. **Configuración de API**: formulario para API key y model slug.
2. **Personalización del agente**: formulario estructurado que genera
   `soul.md` y `user.md` usando una plantilla base.
3. **Taxonomía inicial**: sugerencia de 5-8 tags de inicio. El usuario
   puede editar antes de confirmar.
4. **Resumen**: muestra el árbol de archivos creado y enlaza a documentación.

Los archivos generados son Markdown plano. El usuario puede editarlos
inmediatamente desde el vault sin ninguna fricción.

---

## 14. Fuera del alcance de esta versión

Los siguientes elementos quedan excluidos deliberadamente:

- Gestión de proyectos, tareas o sprints.
- Clasificación semántica automática con embeddings o vectorstores.
- Interfaz kanban o vistas de dashboard complejas.
- Orquestación multi-agente.
- Autonomía del agente para iniciar acciones sin input del usuario.
- Automatizaciones encadenadas (n8n, Make, Zapier).
- Sincronización o backup del vault en servicios externos.
