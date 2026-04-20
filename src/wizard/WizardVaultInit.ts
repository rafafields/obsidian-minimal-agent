import type { VaultManager } from '../vault/VaultManager';
import { wrapLink } from '../utils/links';
import type { SoulFormState } from '../ui/SoulForm';
import { SoulManager } from '../souls/SoulManager';

export interface WizardInitData {
	soulFormState: SoulFormState;
	soulBody: string;
	soulPhrases: string[];
	userBody: string;
	selectedTags: Set<string>;
	apiKey: string;
	modelSlug: string;
	language: string;
}

export async function initVault(data: WizardInitData, vaultManager: VaultManager): Promise<void> {
	const { soulFormState: s, soulBody, soulPhrases, userBody, selectedTags } = data;

	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const datetime = now.toISOString().slice(0, 16);

	await vaultManager.ensurePath('_agent/souls');
	await vaultManager.ensurePath('_agent/memory/episodes');
	await vaultManager.ensurePath('_agent/memory/items');
	await vaultManager.ensurePath('_system/traces');
	await vaultManager.ensurePath('_system/memory_tiers');
	await vaultManager.ensurePath('_system/memory_kinds');
	await vaultManager.ensurePath('_system/states');
	await vaultManager.ensurePath('_system/origins');
	await vaultManager.ensurePath('_system/kinds');

	await refreshSystemDocs(vaultManager, data.language);
	await createBaseFiles(vaultManager);

	const soulId = SoulManager.nameToId(s.name || 'Agent');
	const soulFmLines = [
		'---',
		`name: "${s.name || 'Agent'}"`,
		`emoji: ${s.emoji}`,
		`kind: "${wrapLink('agent_soul')}"`,
		`state: "${wrapLink('active')}"`,
		`created_at: ${date}`,
		`updated_at: ${date}`,
		`origin: "${wrapLink('hybrid')}"`,
	];
	if (s.soulModelSlug) soulFmLines.push(`model_slug: ${s.soulModelSlug}`);
	if (soulPhrases.length > 0) {
		soulFmLines.push(`loading_phrases: [${soulPhrases.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ')}]`);
	}
	soulFmLines.push('---', '', soulBody);
	await vaultManager.writeFile(`_agent/souls/${soulId}.md`, soulFmLines.join('\n'));

	await vaultManager.writeFile('_agent/user.md', [
		'---',
		`kind: "${wrapLink('agent_user')}"`,
		`state: "${wrapLink('active')}"`,
		`created_at: ${date}`,
		`updated_at: ${date}`,
		`origin: "${wrapLink('hybrid')}"`,
		'---',
		'',
		userBody,
	].join('\n'));

	await vaultManager.writeFile('_agent/taxonomy.md', [
		'---',
		'kind: agent_taxonomy',
		`updated_at: ${date}`,
		'origin: human',
		'---',
		'',
		'## Active topics',
		'',
		[...selectedTags].join('\n'),
		'',
		'## Pending proposals',
	].join('\n'));

	await vaultManager.writeFile('_agent/memory/active.md', [
		'---',
		'kind: memory_active',
		'state: current',
		`created_at: ${date}`,
		`updated_at: ${datetime}`,
		'origin: hybrid',
		'---',
		'',
		'## Current focus',
		'',
		'## Recent decisions',
		'',
		'## Blockers',
		'',
		'none',
		'',
		'## Next step',
	].join('\n'));
}

// — System docs refresh —

export async function refreshSystemDocs(vaultManager: VaultManager, language: string): Promise<void> {
	await vaultManager.ensurePath('_system/memory_tiers');
	await vaultManager.ensurePath('_system/memory_kinds');
	await vaultManager.ensurePath('_system/states');
	await vaultManager.ensurePath('_system/origins');
	await vaultManager.ensurePath('_system/kinds');

	const notes = getReferenceNotesContent(language);
	for (const [path, content] of notes) {
		await vaultManager.writeFile(path, content);
	}

	const gsPath = '_system/getting-started.md';
	if (!vaultManager.fileExists(gsPath)) {
		const isEs = language === 'Español';
		await vaultManager.writeFile(gsPath, isEs ? GETTING_STARTED_ES : GETTING_STARTED_EN);
	}
}

function getReferenceNotesContent(language: string): [string, string][] {
	const isEs = language === 'Español';
	return isEs ? REFERENCE_NOTES_ES : REFERENCE_NOTES_EN;
}

// — Getting Started content —

const GETTING_STARTED_EN = `# Getting Started with Minimal Agent

Your agent lives entirely inside this vault. Its personality, memory, and knowledge about you are stored as plain Markdown files you can read and edit at any time.

## Vault structure

\`\`\`
_agent/
  souls/          ← agent personalities (editable)
  user.md         ← how the agent models you (editable)
  taxonomy.md     ← authorized tag vocabulary
  memory/
    active.md     ← working memory (updated each session)
    episodes/     ← session summaries
    items/        ← confirmed long-term memory
_system/          ← reference docs and raw traces (read-only)
\`\`\`

## Memory flow

Each conversation follows this cycle:

1. **Context assembly** — the agent reads \`active.md\`, recent episodes, and high-scored memory items within a token budget.
2. **During the session** — \`active.md\` is updated after each exchange.
3. **Finalize** — click *Finalize and memorize* (or let the idle timer fire) to extract memory candidates from the transcript.
4. **Review** — candidates appear in \`memory/items/\` with [[pending]] state. Confirm the ones worth keeping by changing state to [[active]], or delete to discard.

## Context layers

| Layer | Source | Budget |
|-------|--------|--------|
| [[working\\|Working]] | \`active.md\` + soul + \`user.md\` | Always included (~700 tokens) |
| Episodic | Last 1–2 episode files | Always included (~400 tokens) |
| [[semantic\\|Semantic]] | Confirmed items, ranked by score | Remaining budget |

## Memory item lifecycle

[[pending]] → [[active]] → [[stale]] / [[archived]]

Items are scored by importance, tier, and recency. See [[semantic]] for how scores affect context inclusion.

## Memory item kinds

| Kind | Use when… |
|------|-----------|
| [[decision]] | a choice with lasting implications |
| [[insight]] | a pattern or realization |
| [[constraint]] | a hard limit or non-negotiable |
| [[risk]] | an open threat or uncertainty |
| [[summary]] | a compressed account of a topic |
| [[pattern]] | a recurring behavior or tendency |

## Tips

- Edit \`user.md\` freely — it shapes every conversation.
- The agent never writes to \`soul.md\` or \`user.md\` directly; those are yours.
- Adjust \`taxonomy.md\` to control what tags the agent can assign.
- Browse \`_system/\` to understand the vocabulary used in memory item frontmatter.
`;

const GETTING_STARTED_ES = `# Cómo empezar con Minimal Agent

Tu agente vive completamente dentro de este vault. Su personalidad, memoria y conocimiento sobre ti se almacenan como archivos Markdown que puedes leer y editar en cualquier momento.

## Estructura del vault

\`\`\`
_agent/
  souls/          ← personalidades del agente (editables)
  user.md         ← cómo el agente te modela (editable)
  taxonomy.md     ← vocabulario de etiquetas autorizado
  memory/
    active.md     ← memoria de trabajo (se actualiza cada sesión)
    episodes/     ← resúmenes de sesión
    items/        ← memoria a largo plazo confirmada
_system/          ← documentación de referencia y trazas (solo lectura)
\`\`\`

## Flujo de memoria

Cada conversación sigue este ciclo:

1. **Ensamblaje de contexto** — el agente lee \`active.md\`, episodios recientes y elementos de memoria con alta puntuación dentro de un presupuesto de tokens.
2. **Durante la sesión** — \`active.md\` se actualiza después de cada intercambio.
3. **Finalizar** — haz clic en *Finalizar y memorizar* (o deja que el temporizador de inactividad se active) para extraer candidatos de memoria de la transcripción.
4. **Revisión** — los candidatos aparecen en \`memory/items/\` con estado [[pending]]. Confirma los que valgan la pena cambiando el estado a [[active]], o elimínalos para descartarlos.

## Capas de contexto

| Capa | Fuente | Presupuesto |
|------|--------|-------------|
| [[working\\|Trabajo]] | \`active.md\` + soul + \`user.md\` | Siempre incluida (~700 tokens) |
| Episódica | Últimos 1–2 episodios | Siempre incluida (~400 tokens) |
| [[semantic\\|Semántica]] | Elementos confirmados, puntuados | Presupuesto restante |

## Ciclo de vida de los elementos de memoria

[[pending]] → [[active]] → [[stale]] / [[archived]]

Los elementos se puntúan por importancia, tier y recencia. Consulta [[semantic]] para ver cómo las puntuaciones afectan la inclusión en el contexto.

## Tipos de elemento de memoria

| Tipo | Úsalo cuando… |
|------|---------------|
| [[decision\\|decisión]] | una elección con implicaciones duraderas |
| [[insight]] | un patrón o realización |
| [[constraint\\|restricción]] | un límite duro o no negociable |
| [[risk\\|riesgo]] | una amenaza o incertidumbre abierta |
| [[summary\\|resumen]] | un relato comprimido de un tema |
| [[pattern\\|patrón]] | un comportamiento o tendencia recurrente |

## Consejos

- Edita \`user.md\` libremente — moldea cada conversación.
- El agente nunca escribe en \`soul.md\` ni en \`user.md\` directamente; esos archivos son tuyos.
- Ajusta \`taxonomy.md\` para controlar qué etiquetas puede asignar el agente.
- Explora \`_system/\` para entender el vocabulario usado en el frontmatter de los elementos de memoria.
`;

// — Reference notes content —

const REFERENCE_NOTES_EN: [string, string][] = [
	['_system/memory_tiers/working.md', `# Working Memory

The agent's short-term state, stored in \`_agent/memory/active.md\`. Updated section-by-section after each conversation turn and always included in context, regardless of token budget.

Contains current focus, recent decisions, blockers, and next step. Old content is gradually replaced as new sessions update each section.`],

	['_system/memory_tiers/semantic.md', `# Semantic Memory

The long-term knowledge layer, made up of confirmed memory items in \`_agent/memory/items/\`. Each item has a score computed from importance, tier bonus, and staleness penalty.

During context assembly, the highest-scoring items are included until the remaining token budget is exhausted. Items with state [[stale]] or [[archived]] are excluded.`],

	['_system/memory_kinds/decision.md', `# Decision

A choice made with deliberate intent, with implications that persist across sessions. Use this to remember why something was decided: strategy shifts, personal commitments, architectural choices.`],

	['_system/memory_kinds/insight.md', `# Insight

A pattern or realization derived from experience. Use this when a session surfaces something non-obvious: a connection between ideas, a lesson learned, a model update about how something works.`],

	['_system/memory_kinds/constraint.md', `# Constraint

A hard limit that shapes what is possible. Captures things the agent should never forget: time limits, resource constraints, rules, non-negotiables.`],

	['_system/memory_kinds/risk.md', `# Risk

An open threat, uncertainty, or potential problem worth monitoring. Unlike a [[constraint]] (which is certain), a risk is probabilistic — something that might happen.`],

	['_system/memory_kinds/summary.md', `# Summary

A compressed account of events, context, or a topic. Use for complex subjects that would take too many tokens to store in full — distill the key points.`],

	['_system/memory_kinds/pattern.md', `# Pattern

A recurring behavior, structure, or tendency worth naming. Useful for habits, workflows, or dynamics that appear across multiple sessions.`],

	['_system/states/pending.md', `# Pending

Extracted by the agent and awaiting your review. Items in this state are stored in \`_agent/memory/items/\` but **not included in context** until confirmed.

To confirm: change the state to [[active]] in the file's frontmatter.`],

	['_system/states/active.md', `# Active

Confirmed and eligible for context assembly. Items with this state are included in the [[semantic\\|semantic]] layer based on their score.`],

	['_system/states/stale.md', `# Stale

Expired: the \`expires_at\` date has passed. The plugin automatically marks items stale on load (if *Auto-archive expired items* is enabled in settings). Stale items are excluded from context but remain in the vault.`],

	['_system/states/archived.md', `# Archived

Manually retired. Excluded from context but kept for reference. Use for items that are no longer relevant but you don't want to permanently delete.`],

	['_system/states/confirmed.md', `# Confirmed

Episode state: the session summary has been accepted as part of the permanent record. Confirmed episodes are included in the episodic context layer.`],

	['_system/origins/agent.md', `# Agent

Created by the LLM during session finalization. Memory candidates with this origin are proposals from the agent based on transcript content.`],

	['_system/origins/human.md', `# Human

Created directly by the user. Files edited manually in the vault carry this origin.`],

	['_system/origins/hybrid.md', `# Hybrid

Created collaboratively between user and agent — for example, setup wizard files that combine user input with LLM generation.`],

	['_system/kinds/memory_item.md', `# Memory Item

A discrete piece of long-term memory. Stored as a Markdown file in \`_agent/memory/items/\` with structured frontmatter: state, kind, importance, confidence, tags, expiry date, and origin.`],

	['_system/kinds/memory_episode.md', `# Memory Episode

A session summary generated when a conversation is finalized. Stored in \`_agent/memory/episodes/\` and includes session ID, soul used, token cost, and a compressed transcript.`],

	['_system/kinds/agent_soul.md', `# Agent Soul

Personality and identity definition for an agent. Stored in \`_agent/souls/\` as an editable Markdown file. Includes purpose, values, voice, and optional loading phrases.`],
];

const REFERENCE_NOTES_ES: [string, string][] = [
	['_system/memory_tiers/working.md', `# Memoria de trabajo

Estado a corto plazo del agente, almacenado en \`_agent/memory/active.md\`. Se actualiza sección por sección después de cada turno de conversación y siempre se incluye en el contexto, independientemente del presupuesto de tokens.

Contiene foco actual, decisiones recientes, bloqueos y próximo paso. El contenido antiguo se reemplaza gradualmente conforme nuevas sesiones actualizan cada sección.`],

	['_system/memory_tiers/semantic.md', `# Memoria semántica

Capa de conocimiento a largo plazo formada por elementos de memoria confirmados en \`_agent/memory/items/\`. Cada elemento tiene una puntuación calculada a partir de importancia, bonificación de tier y penalización por obsolescencia.

Durante el ensamblaje de contexto, los elementos con mayor puntuación se incluyen hasta agotar el presupuesto restante. Los elementos con estado [[stale]] o [[archived]] se excluyen.`],

	['_system/memory_kinds/decision.md', `# Decisión

Una elección tomada con intención deliberada y consecuencias que persisten entre sesiones. Úsala para recordar por qué se decidió algo: cambios de estrategia, compromisos personales, elecciones de diseño.`],

	['_system/memory_kinds/insight.md', `# Insight

Un patrón o realización derivado de la experiencia. Úsalo cuando una sesión revela algo no obvio: una conexión entre ideas, una lección aprendida, una actualización del modelo mental sobre cómo funciona algo.`],

	['_system/memory_kinds/constraint.md', `# Restricción

Un límite duro que determina lo que es posible. Captura cosas que el agente nunca debe olvidar: límites de tiempo, restricciones de recursos, reglas, no negociables.`],

	['_system/memory_kinds/risk.md', `# Riesgo

Una amenaza abierta, incertidumbre o problema potencial que vale la pena monitorear. A diferencia de una [[constraint\\|restricción]] (que es cierta), un riesgo es probabilístico — algo que podría ocurrir.`],

	['_system/memory_kinds/summary.md', `# Resumen

Un relato comprimido de eventos, contexto o un tema. Úsalo para temas complejos que ocuparían demasiados tokens si se almacenaran completos — extrae los puntos clave.`],

	['_system/memory_kinds/pattern.md', `# Patrón

Un comportamiento, estructura o tendencia recurrente que vale la pena nombrar. Útil para hábitos, flujos de trabajo o dinámicas que aparecen en múltiples sesiones.`],

	['_system/states/pending.md', `# Pendiente

Extraído por el agente y pendiente de revisión. Los elementos en este estado se almacenan en \`_agent/memory/items/\` pero **no se incluyen en el contexto** hasta que se confirmen.

Para confirmar: cambia el estado a [[active]] en el frontmatter del archivo.`],

	['_system/states/active.md', `# Activo

Confirmado y elegible para el ensamblaje de contexto. Los elementos con este estado se incluyen en la capa [[semantic\\|semántica]] según su puntuación.`],

	['_system/states/stale.md', `# Obsoleto

Expirado: la fecha \`expires_at\` ha pasado. El plugin marca automáticamente los elementos como obsoletos al cargar (si *Archivar automáticamente elementos caducados* está activado en la configuración). Los elementos obsoletos se excluyen del contexto pero permanecen en el vault.`],

	['_system/states/archived.md', `# Archivado

Retirado manualmente. Excluido del contexto pero conservado para referencia. Úsalo para elementos que ya no son relevantes pero que no quieres eliminar permanentemente.`],

	['_system/states/confirmed.md', `# Confirmado

Estado de episodio: el resumen de sesión ha sido aceptado como parte del registro permanente. Los episodios confirmados se incluyen en la capa episódica del contexto.`],

	['_system/origins/agent.md', `# Agente

Creado por el LLM durante la finalización de la sesión. Los candidatos de memoria con este origen son propuestas del agente basadas en el contenido de la transcripción.`],

	['_system/origins/human.md', `# Humano

Creado directamente por el usuario. Los archivos editados manualmente en el vault llevan este origen.`],

	['_system/origins/hybrid.md', `# Híbrido

Creado de forma colaborativa entre usuario y agente — por ejemplo, los archivos generados por el wizard de configuración que combinan input del usuario con generación del LLM.`],

	['_system/kinds/memory_item.md', `# Elemento de memoria

Una pieza discreta de memoria a largo plazo. Se almacena como archivo Markdown en \`_agent/memory/items/\` con frontmatter estructurado: estado, tipo, importancia, confianza, etiquetas, fecha de expiración y origen.`],

	['_system/kinds/memory_episode.md', `# Episodio de memoria

Resumen de sesión generado al finalizar una conversación. Se almacena en \`_agent/memory/episodes/\` e incluye ID de sesión, soul usado, coste en tokens y una transcripción comprimida.`],

	['_system/kinds/agent_soul.md', `# Soul del agente

Definición de personalidad e identidad para un agente. Se almacena en \`_agent/souls/\` como archivo Markdown editable. Incluye propósito, valores, voz y frases de carga opcionales.`],
];

async function createBaseFiles(vaultManager: VaultManager): Promise<void> {
	const bases: [string, string][] = [
		['_agent/memory/episodes/_episodes.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_agent/memory/episodes")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - kind',
			'      - state',
			'      - origin',
			'      - session_id',
			'      - soul',
			'      - token_cost',
			'      - created_at',
			'      - updated_at',
		].join('\n')],
		['_agent/memory/items/_memory-items.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_agent/memory/items")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - kind',
			'      - state',
			'      - created_at',
			'      - updated_at',
			'      - origin',
			'      - memory_tier',
			'      - memory_kind',
			'      - importance',
			'      - confidence',
			'      - tags',
			'      - expires_at',
			'      - proposed_tags',
			'      - related_to',
			'      - session_id',
			'      - soul',
		].join('\n')],
		['_agent/souls/_souls.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_agent/souls")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - emoji',
			'      - name',
			'      - kind',
			'      - loading_phrases',
			'      - origin',
			'      - created_at',
			'      - updated_at',
		].join('\n')],
		['_system/traces/_traces.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_system/traces")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - file.ctime',
		].join('\n')],
	];

	for (const [path, content] of bases) {
		if (!vaultManager.fileExists(path)) {
			await vaultManager.writeFile(path, content);
		}
	}
}
