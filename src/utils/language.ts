export const LANGUAGES: Record<string, string> = {
	'English':   'English',
	'Español':   'Español',
	'Français':  'Français',
	'Deutsch':   'Deutsch',
	'Português': 'Português',
	'Italiano':  'Italiano',
	'中文':       '中文',
	'日本語':     '日本語',
	'한국어':     '한국어',
};

const LOCALE_MAP: Record<string, string> = {
	es: 'Español',
	fr: 'Français',
	de: 'Deutsch',
	pt: 'Português',
	it: 'Italiano',
	zh: '中文',
	ja: '日本語',
	ko: '한국어',
};

export function detectDefaultLanguage(): string {
	const code = window.navigator.language?.split('-')[0] ?? 'en';
	return LOCALE_MAP[code] ?? 'English';
}

// ─── Translations ────────────────────────────────────────────────────────────

const EN = {
	// Shared UI
	back:             'Back',
	next:             'Next',
	finish:           'Finish',
	cancel:           'Cancel',
	try_again:        'Try again',
	close:            'Close',
	starting:         'Starting…',
	error_unexpected: 'An unexpected error occurred.',
	generate:         'Generate',

	// Shared field labels
	language:                    'Language',
	language_desc:               'Language for the generated documents.',
	model:                       'Model',
	custom_model_slug:           'Custom model slug',
	soul_emoji:                  'Emoji',
	soul_emoji_desc:             'Single emoji shown in the soul selector.',
	soul_model_desc:             'Model to use for this soul. Leave blank to use the global model from settings.',
	soul_model_global:           '— Global default —',
	core_purpose:                'Core purpose',
	core_purpose_desc:           'What is this soul fundamentally for? (2–3 sentences)',
	core_purpose_placeholder:    'A thinking companion for focused creative work.',
	core_values:                 'Core values',
	core_values_desc:            'What principles should guide it?',
	core_values_placeholder:     'Honesty, clarity, brevity.',
	voice_tone:                  'Voice and tone',
	voice_tone_desc:             'How should it communicate?',
	voice_tone_placeholder:      'Direct and concise. No filler. No hedging.',

	// ChatView
	chat_saving_session:     'Saving session…',
	chat_extracting_memories:'Extracting memories…',
	chat_thinking:           '{name} is thinking…',
	chat_input_placeholder:  'Message… (Ctrl+Enter to send)',
	chat_send:               'Send',
	chat_finalize:           'Finalize and memorize',
	chat_save:               'Save conversation',
	chat_saved_notice:       'Conversation saved to {path}',
	chat_agent_error:        'Agent error: {msg}',
	chat_create_soul_title:  'Create new soul',

	// SetupWizard
	wizard_step_of:             'Step {step} of {total}',
	wizard_welcome_title:       'Welcome to Minimal Agent',
	wizard_welcome_desc1:       'A minimal AI agent that lives entirely inside your vault. Its personality, memory, and everything it knows about you are stored as plain Markdown files you can read and edit at any time.',
	wizard_welcome_desc2:       'This wizard will help you configure the API connection, define your agent\'s identity, and set up your vault structure. It only takes a minute.',
	wizard_welcome_language_desc: 'Language used for the generated soul and user documents.',
	wizard_get_started:         'Get started',

	wizard_api_title:           'Connect to OpenRouter',
	wizard_api_desc:            'Minimal Agent uses OpenRouter to access language models. Your API key is stored only in Obsidian plugin settings — never written to the vault.',
	wizard_api_key_name:        'OpenRouter API key',
	wizard_api_key_desc:        'Your key from openrouter.ai.',
	wizard_model_desc:          'Pre-selected models. Those marked {zdr} comply with OpenRouter\'s Zero Data Retention policy.',
	wizard_api_key_required:    'API key is required to continue.',

	wizard_about_you_title:     'About you',
	wizard_about_you_desc:      'These fields generate _agent/user.md — how the agent models you. Edit it freely at any time.',
	wizard_work_style_name:     'How you work',
	wizard_work_style_desc:     'Work style, rhythm, tools, or context the agent should know.',
	wizard_work_style_ph:       'I work in focused 2-hour blocks. I prefer async communication.',
	wizard_comm_prefs_name:     'Communication preferences',
	wizard_comm_prefs_desc:     'How do you want responses structured?',
	wizard_comm_prefs_ph:       'Short answers by default. Offer to expand if needed.',
	wizard_focus_name:          'Current areas of focus',
	wizard_focus_desc:          'Topics or projects you\'re working on right now.',
	wizard_focus_ph:            'Building an Obsidian plugin, learning TypeScript.',

	wizard_define_title:        'Define your agent',
	wizard_define_desc:         'These fields generate _agent/souls/default.md — the stable identity of your agent. You can edit this file directly in Obsidian at any time.',
	wizard_agent_name_name:     'Agent name',
	wizard_agent_name_desc:     'How the agent will be identified in the chat and interface.',

	wizard_tags_title:          'Initial tag taxonomy',
	wizard_tags_desc:           'Select the topic tags to activate in _agent/taxonomy.md. The agent can only assign tags from this list. You can add more directly in the file at any time.',

	wizard_loading_title:       'Setting up your agent…',
	wizard_loading_user:        'Generating user.md…',
	wizard_loading_soul:        'Generating soul…',
	wizard_loading_files:       'Writing vault files…',

	wizard_done_title:          'You\'re all set!',
	wizard_done_desc:           'Your agent "{name}" has been initialized with {tags} active tags. All files are ready in your vault under _agent/.',
	wizard_done_cost:           'Generation cost: {cost}',
	wizard_done_open_desc:      'Open the chat to start your first conversation. You can access it anytime from the ribbon or the command palette.',
	wizard_open_chat:           'Open chat',
	wizard_error_title:         'Setup failed',
	wizard_user_gen_failed:     'User document generation failed: {msg}. Using form input as fallback.',
	wizard_soul_gen_failed:     'Soul generation failed: {msg}. Using fallback soul.',

	// SoulGeneratorModal
	soul_gen_title:          'Create a new soul',
	soul_gen_desc:           'Define the identity of this soul. These fields generate a soul file in _agent/souls/. You can edit it directly in Obsidian at any time.',
	soul_gen_name_name:      'Soul name',
	soul_gen_name_desc:      'Display name for this soul (e.g. "Sofia").',
	soul_gen_name_ph:        'My Agent',
	soul_gen_language_desc:  'Language for the generated soul document.',
	soul_gen_name_required:  'Soul name is required.',
	soul_gen_generating_title: 'Generating soul…',
	soul_gen_generating_soul:  'Generating soul document…',
	soul_gen_generating_file:  'Writing file…',
	soul_gen_done_title:     'Soul created!',
	soul_gen_done_desc:      '"{name}" has been saved to _agent/souls/{id}.md.',
	soul_gen_error_title:    'Generation failed',

	// Settings
	settings_souls_section:       'Souls',
	settings_default_soul_name:   'Default soul',
	settings_default_soul_desc:   'Soul loaded at the start of every new conversation.',
	settings_create_soul_btn:     'Create new soul',
	settings_souls_loading:       'Loading… ({id})',
	settings_souls_none:          'No souls found — create one',

	settings_api_section:         'API',
	settings_api_key_name:        'API key',
	settings_api_key_configured:  'API key configured.',
	settings_api_key_missing:     'No API key set — the agent will not work until you add one.',
	settings_model_desc:          'Pre-selected models. Those marked {zdr} comply with OpenRouter\'s Zero Data Retention policy. Choose "Custom…" to enter any other slug.',
	settings_model_custom_desc:   'Any valid OpenRouter model ID (e.g. mistralai/mistral-7b-instruct). ZDR is not guaranteed for custom models.',
	settings_model_custom_ph:     'provider/model-name',

	settings_language_section:    'Language',
	settings_language_name:       'Response language',
	settings_language_desc:       'Language used for all agent responses and memory extraction.',

	settings_context_section:     'Context',
	settings_token_budget_name:   'Token budget',
	settings_token_budget_desc:   'Maximum tokens to use for context assembly per session.',
	settings_ctx_calculating:     'Calculating context usage…',
	settings_ctx_usage:           'Context usage: ~{used} / {budget} tokens ({pct}%){dropped}',
	settings_ctx_dropped:         ' · {n} item{s} dropped',
	settings_ctx_error:           'Could not calculate context — run the setup wizard first.',
	settings_episode_days_name:   'Episode history (days)',
	settings_episode_days_desc:   'How many days of past episodes to load into context.',
	settings_min_importance_name: 'Minimum importance for context',
	settings_min_importance_desc: 'Memory items below this importance level are excluded from context.',
	settings_importance_low:      'Low',
	settings_importance_medium:   'Medium',
	settings_importance_high:     'High',
	settings_importance_critical: 'Critical',

	settings_memory_section:      'Memory',
	settings_require_confirm_name:'Require confirmation before writing',
	settings_require_confirm_desc:'When enabled, memory candidates are written to _pending/ for manual review before being confirmed.',
	settings_auto_archive_name:   'Auto-archive expired items',
	settings_auto_archive_desc:   'Automatically mark memory items as stale when their expiry date passes.',
	settings_trace_retention_name:'Trace retention (days)',
	settings_trace_retention_desc:'Raw API traces older than this are deleted automatically on load.',

	settings_session_section:     'Session',
	settings_idle_timeout_name:   'Idle timeout (minutes)',
	settings_idle_timeout_desc:   'Minutes of inactivity before the session is automatically finalized and memory is extracted. Set to 0 to disable.',

	// OpenRouter links
	openrouter_no_account:      'Don\'t have an account?',
	openrouter_signup_link:     'Create one at openrouter.ai →',
	zdr_desc:                   'Zero Data Retention: prompts are not stored or used for training.',
	zdr_learn_more:             'Learn more',

	// SessionManager notices
	session_extraction_failed: 'Memory extraction failed — session saved without candidates.',
	session_saved_zero:        'Session saved. No memory candidates extracted.',
	session_saved_one:         'Session saved. 1 memory candidate written to _pending/.',
	session_saved_many:        'Session saved. {n} memory candidates written to _pending/.',
} as const;

type TranslationKey = keyof typeof EN;

const ES: Partial<Record<TranslationKey, string>> = {
	// Shared UI
	back:             'Atrás',
	next:             'Siguiente',
	finish:           'Finalizar',
	cancel:           'Cancelar',
	try_again:        'Intentar de nuevo',
	close:            'Cerrar',
	starting:         'Iniciando…',
	error_unexpected: 'Ha ocurrido un error inesperado.',
	generate:         'Generar',

	// Shared field labels
	language:                 'Idioma',
	language_desc:            'Idioma para los documentos generados.',
	model:                    'Modelo',
	custom_model_slug:        'Slug de modelo personalizado',
	soul_emoji:               'Emoji',
	soul_emoji_desc:          'Emoji único mostrado en el selector de almas.',
	soul_model_desc:          'Modelo a usar para esta alma. Déjalo en blanco para usar el modelo global de la configuración.',
	soul_model_global:        '— Predeterminado global —',
	core_purpose:             'Propósito central',
	core_purpose_desc:        '¿Para qué sirve fundamentalmente esta alma? (2–3 frases)',
	core_purpose_placeholder: 'Un compañero de pensamiento para mi trabajo diario.',
	core_values:              'Valores fundamentales',
	core_values_desc:         '¿Qué principios deben guiarla?',
	core_values_placeholder:  'Honestidad, claridad, brevedad.',
	voice_tone:               'Voz y tono',
	voice_tone_desc:          '¿Cómo debe comunicarse?',
	voice_tone_placeholder:   'Directa y concisa. Sin relleno. Sin ambigüedades.',

	// ChatView
	chat_saving_session:      'Guardando sesión…',
	chat_extracting_memories: 'Extrayendo memorias…',
	chat_thinking:            '{name} está pensando…',
	chat_input_placeholder:   'Mensaje… (Ctrl+Intro para enviar)',
	chat_send:                'Enviar',
	chat_finalize:            'Finalizar y memorizar',
	chat_save:                'Guardar conversación',
	chat_saved_notice:        'Conversación guardada en {path}',
	chat_agent_error:         'Error del agente: {msg}',
	chat_create_soul_title:   'Crear nueva alma',

	// SetupWizard
	wizard_step_of:             'Paso {step} de {total}',
	wizard_welcome_title:       'Bienvenido a Minimal Agent',
	wizard_welcome_desc1:       'Un agente de IA minimal que vive completamente dentro de tu vault. Su personalidad, memoria y todo lo que sabe sobre ti se almacena como archivos Markdown que puedes leer y editar en cualquier momento.',
	wizard_welcome_desc2:       'Este asistente te ayudará a configurar la conexión API, definir la identidad de tu agente y preparar la estructura del vault. Solo lleva un minuto.',
	wizard_welcome_language_desc: 'Idioma usado para los documentos de alma y usuario generados.',
	wizard_get_started:         'Comenzar',

	wizard_api_title:           'Conectar a OpenRouter',
	wizard_api_desc:            'Minimal Agent usa OpenRouter para acceder a modelos de lenguaje. Tu clave API se almacena solo en la configuración del plugin de Obsidian, nunca se escribe en el vault.',
	wizard_api_key_name:        'Clave API de OpenRouter',
	wizard_api_key_desc:        'Tu clave de openrouter.ai.',
	wizard_model_desc:          'Modelos preseleccionados. Los marcados con {zdr} cumplen con la política de Retención Cero de Datos de OpenRouter.',
	wizard_api_key_required:    'Se requiere la clave API para continuar.',

	wizard_about_you_title:     'Sobre ti',
	wizard_about_you_desc:      'Estos campos generan _agent/user.md — cómo el agente te modela. Edítalo libremente en cualquier momento.',
	wizard_work_style_name:     'Cómo trabajas',
	wizard_work_style_desc:     'Estilo de trabajo, ritmo, herramientas o contexto que el agente debe conocer.',
	wizard_work_style_ph:       'Trabajo en bloques de 2 horas de concentración. Prefiero la comunicación asíncrona.',
	wizard_comm_prefs_name:     'Preferencias de comunicación',
	wizard_comm_prefs_desc:     '¿Cómo quieres que se estructuren las respuestas?',
	wizard_comm_prefs_ph:       'Respuestas cortas por defecto. Ofrece ampliar si es necesario.',
	wizard_focus_name:          'Áreas de enfoque actuales',
	wizard_focus_desc:          'Temas o proyectos en los que estás trabajando ahora.',
	wizard_focus_ph:            'Construyendo un plugin de Obsidian, aprendiendo TypeScript.',

	wizard_define_title:        'Define tu agente',
	wizard_define_desc:         'Estos campos generan _agent/souls/default.md — la identidad estable de tu agente. Puedes editar este archivo directamente en Obsidian en cualquier momento.',
	wizard_agent_name_name:     'Nombre del agente',
	wizard_agent_name_desc:     'Cómo se identificará el agente en el chat y la interfaz.',

	wizard_tags_title:          'Taxonomía de etiquetas inicial',
	wizard_tags_desc:           'Selecciona las etiquetas de tema a activar en _agent/taxonomy.md. El agente solo puede asignar etiquetas de esta lista. Puedes añadir más directamente en el archivo en cualquier momento.',

	wizard_loading_title:       'Configurando tu agente…',
	wizard_loading_user:        'Generando user.md…',
	wizard_loading_soul:        'Generando soul…',
	wizard_loading_files:       'Escribiendo archivos del vault…',

	wizard_done_title:          '¡Todo listo!',
	wizard_done_desc:           'Tu agente "{name}" ha sido inicializado con {tags} etiquetas activas. Todos los archivos están listos en tu vault bajo _agent/.',
	wizard_done_cost:           'Coste de generación: {cost}',
	wizard_done_open_desc:      'Abre el chat para empezar tu primera conversación. Puedes acceder en cualquier momento desde la barra lateral o la paleta de comandos.',
	wizard_open_chat:           'Abrir chat',
	wizard_error_title:         'Configuración fallida',
	wizard_user_gen_failed:     'La generación del documento de usuario falló: {msg}. Usando el formulario como alternativa.',
	wizard_soul_gen_failed:     'La generación del alma falló: {msg}. Usando alma predeterminada.',

	// SoulGeneratorModal
	soul_gen_title:            'Crear una nueva alma',
	soul_gen_desc:             'Define la identidad de esta alma. Estos campos generan un archivo de alma en _agent/souls/. Puedes editarlo directamente en Obsidian en cualquier momento.',
	soul_gen_name_name:        'Nombre del alma',
	soul_gen_name_desc:        'Nombre de visualización para esta alma (p.ej. "Sofía").',
	soul_gen_name_ph:          'Mi Agente',
	soul_gen_language_desc:    'Idioma para el documento de alma generado.',
	soul_gen_name_required:    'El nombre del alma es obligatorio.',
	soul_gen_generating_title: 'Generando alma…',
	soul_gen_generating_soul:  'Generando documento de alma…',
	soul_gen_generating_file:  'Escribiendo archivo…',
	soul_gen_done_title:       '¡Alma creada!',
	soul_gen_done_desc:        '"{name}" ha sido guardada en _agent/souls/{id}.md.',
	soul_gen_error_title:      'Generación fallida',

	// Settings
	settings_souls_section:       'Almas',
	settings_default_soul_name:   'Alma predeterminada',
	settings_default_soul_desc:   'Alma cargada al inicio de cada nueva conversación.',
	settings_create_soul_btn:     'Crear nueva alma',
	settings_souls_loading:       'Cargando… ({id})',
	settings_souls_none:          'No se encontraron almas — crea una',

	settings_api_section:         'API',
	settings_api_key_name:        'Clave API',
	settings_api_key_configured:  'Clave API configurada.',
	settings_api_key_missing:     'No hay clave API establecida — el agente no funcionará hasta que añadas una.',
	settings_model_desc:          'Modelos preseleccionados. Los marcados con {zdr} cumplen con la política de Retención Cero de Datos de OpenRouter. Elige "Personalizado…" para usar otro slug.',
	settings_model_custom_desc:   'Cualquier ID de modelo válido de OpenRouter (p.ej. mistralai/mistral-7b-instruct). No se garantiza ZDR en modelos personalizados.',
	settings_model_custom_ph:     'proveedor/nombre-modelo',

	settings_language_section:    'Idioma',
	settings_language_name:       'Idioma de respuesta',
	settings_language_desc:       'Idioma usado para todas las respuestas del agente y la extracción de memoria.',

	settings_context_section:     'Contexto',
	settings_token_budget_name:   'Presupuesto de tokens',
	settings_token_budget_desc:   'Tokens máximos a usar para el ensamblaje de contexto por sesión.',
	settings_ctx_calculating:     'Calculando uso de contexto…',
	settings_ctx_usage:           'Uso de contexto: ~{used} / {budget} tokens ({pct}%){dropped}',
	settings_ctx_dropped:         ' · {n} elemento{s} descartado{s}',
	settings_ctx_error:           'No se pudo calcular el contexto — ejecuta primero el asistente de configuración.',
	settings_episode_days_name:   'Historial de episodios (días)',
	settings_episode_days_desc:   'Cuántos días de episodios pasados cargar en el contexto.',
	settings_min_importance_name: 'Importancia mínima para el contexto',
	settings_min_importance_desc: 'Los elementos de memoria por debajo de este nivel de importancia se excluyen del contexto.',
	settings_importance_low:      'Baja',
	settings_importance_medium:   'Media',
	settings_importance_high:     'Alta',
	settings_importance_critical: 'Crítica',

	settings_memory_section:      'Memoria',
	settings_require_confirm_name:'Requerir confirmación antes de escribir',
	settings_require_confirm_desc:'Cuando está activado, los candidatos de memoria se escriben en _pending/ para revisión manual antes de ser confirmados.',
	settings_auto_archive_name:   'Archivar automáticamente elementos caducados',
	settings_auto_archive_desc:   'Marca automáticamente los elementos de memoria como obsoletos cuando pasa su fecha de caducidad.',
	settings_trace_retention_name:'Retención de trazas (días)',
	settings_trace_retention_desc:'Las trazas API sin procesar más antiguas que esto se eliminan automáticamente al cargar.',

	settings_session_section:     'Sesión',
	settings_idle_timeout_name:   'Tiempo de espera por inactividad (minutos)',
	settings_idle_timeout_desc:   'Minutos de inactividad antes de que la sesión se finalice automáticamente y se extraiga la memoria. Establecer en 0 para desactivar.',

	// OpenRouter links
	openrouter_no_account:  '¿No tienes cuenta?',
	openrouter_signup_link: 'Créala en openrouter.ai →',
	zdr_desc:               'Retención cero de datos: los prompts no se almacenan ni se usan para entrenamiento.',
	zdr_learn_more:         'Más info',

	// SessionManager notices
	session_extraction_failed: 'La extracción de memoria falló — sesión guardada sin candidatos.',
	session_saved_zero:        'Sesión guardada. No se extrajeron candidatos de memoria.',
	session_saved_one:         'Sesión guardada. 1 candidato de memoria escrito en _pending/.',
	session_saved_many:        'Sesión guardada. {n} candidatos de memoria escritos en _pending/.',
};

const TRANSLATIONS: Record<string, Partial<Record<TranslationKey, string>>> = {
	Español: ES,
};

/** Translate a UI key to the current language, with optional variable substitution. */
export function t(key: TranslationKey, lang: string, vars?: Record<string, string>): string {
	const dict = TRANSLATIONS[lang] ?? {};
	let str: string = (dict[key] ?? EN[key]) as string;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			str = str.replace(`{${k}}`, v);
		}
	}
	return str;
}
