import { App, Modal, Notice, Setting } from 'obsidian';
import type MinimalAgentPlugin from '../main';
import type { VaultManager } from '../vault/VaultManager';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { SOUL_GENERATION_PROMPT, SOUL_FALLBACK } from './soulInstructions';

const SUGGESTED_TAGS = [
	'#topic/work',
	'#topic/personal',
	'#topic/learning',
	'#topic/projects',
	'#topic/health',
	'#topic/finance',
	'#topic/relationships',
	'#topic/creativity',
];

const TOTAL_STEPS = 5;

type FinishState = 'loading' | 'done' | 'error';

export class SetupWizard extends Modal {
	private step = 1;
	private agentName: string;
	private apiKey: string;
	private modelSlug: string;
	private corePurpose = '';
	private coreValues = '';
	private voiceTone = '';
	private workStyle = '';
	private commPreferences = '';
	private interests = '';
	private selectedTags: Set<string>;
	private finishState: FinishState = 'loading';
	private finishError = '';

	constructor(
		app: App,
		private plugin: MinimalAgentPlugin,
		private vaultManager: VaultManager,
	) {
		super(app);
		this.agentName = plugin.settings.agentName;
		this.apiKey = plugin.settings.apiKey;
		this.modelSlug = plugin.settings.modelSlug;
		this.selectedTags = new Set(SUGGESTED_TAGS);
	}

	static isFirstRun(app: App): boolean {
		return app.vault.getAbstractFileByPath('_agent/soul.md') === null;
	}

	onOpen() {
		this.modalEl.addClass('agent-wizard-modal');
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		if (this.step <= TOTAL_STEPS) {
			contentEl.createEl('p', {
				text: `Step ${this.step} of ${TOTAL_STEPS}`,
				cls: 'agent-wizard-progress',
			});
		}

		switch (this.step) {
			case 1: this.renderStep1(); break;
			case 2: this.renderStep2(); break;
			case 3: this.renderStep3(); break;
			case 4: this.renderStep4(); break;
			case 5: this.renderStep5(); break;
			case 6: this.renderStep6(); break;
		}
	}

	// — Step 1: Welcome —

	private renderStep1() {
		const { contentEl } = this;
		this.renderEmoji(contentEl, '🤖');
		contentEl.createEl('h2', { text: 'Welcome to Minimal Agent' });
		contentEl.createEl('p', {
			text: 'A minimal AI agent that lives entirely inside your vault. Its personality, memory, and everything it knows about you are stored as plain Markdown files you can read and edit at any time.',
			cls: 'agent-wizard-desc',
		});
		contentEl.createEl('p', {
			text: 'This wizard will help you configure the API connection, define your agent\'s identity, and set up your vault structure. It only takes a minute.',
			cls: 'agent-wizard-desc',
		});

		this.renderNav(null, () => { this.step = 2; this.render(); }, 'Get started');
	}

	// — Step 2: API config —

	private renderStep2() {
		const { contentEl } = this;
		this.renderEmoji(contentEl, '🔑');
		contentEl.createEl('h2', { text: 'Connect to OpenRouter' });
		contentEl.createEl('p', {
			text: 'Minimal Agent uses OpenRouter to access language models. Your API key is stored only in Obsidian plugin settings — never written to the vault.',
			cls: 'agent-wizard-desc',
		});

		new Setting(contentEl)
			.setName('OpenRouter API key')
			.setDesc('Your key from openrouter.ai.')
			.addText(text => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('sk-or-...')
					.setValue(this.apiKey)
					.onChange(v => { this.apiKey = v.trim(); });
			});

		new Setting(contentEl)
			.setName('Model')
			.setDesc('OpenRouter model slug (e.g. openai/gpt-4o, anthropic/claude-sonnet-4-5).')
			.addText(text => text
				.setPlaceholder('openai/gpt-4o')
				.setValue(this.modelSlug)
				.onChange(v => { this.modelSlug = v.trim(); }));

		this.renderNav(
			() => { this.step = 1; this.render(); },
			() => {
				if (!this.apiKey) {
					new Notice('API key is required to continue.');
					return;
				}
				this.step = 3;
				this.render();
			},
		);
	}

	// — Step 3: Define agent —

	private renderStep3() {
		const { contentEl } = this;
		this.renderEmoji(contentEl, '✨');
		contentEl.createEl('h2', { text: 'Define your agent' });
		contentEl.createEl('p', {
			text: 'These fields generate _agent/soul.md — the stable identity of your agent. You can edit this file directly in Obsidian at any time.',
			cls: 'agent-wizard-desc',
		});

		new Setting(contentEl)
			.setName('Agent name')
			.setDesc('How the agent will be identified in the chat and interface.')
			.addText(text => text
				.setPlaceholder('Agent')
				.setValue(this.agentName)
				.onChange(v => { this.agentName = v.trim(); }));

		new Setting(contentEl)
			.setName('Core purpose')
			.setDesc('What is this agent fundamentally for? (2–3 sentences)')
			.addTextArea(ta => {
				ta.setValue(this.corePurpose)
					.setPlaceholder('A general-purpose thinking companion for my daily work.')
					.onChange(v => { this.corePurpose = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName('Core values')
			.setDesc('What principles should guide it?')
			.addTextArea(ta => {
				ta.setValue(this.coreValues)
					.setPlaceholder('Honesty, clarity, brevity.')
					.onChange(v => { this.coreValues = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName('Voice and tone')
			.setDesc('How should it communicate?')
			.addTextArea(ta => {
				ta.setValue(this.voiceTone)
					.setPlaceholder('Direct and concise. No filler. No hedging.')
					.onChange(v => { this.voiceTone = v; });
				ta.inputEl.rows = 3;
			});

		this.renderNav(
			() => { this.step = 2; this.render(); },
			() => { this.step = 4; this.render(); },
		);
	}

	// — Step 4: About you —

	private renderStep4() {
		const { contentEl } = this;
		this.renderEmoji(contentEl, '👤');
		contentEl.createEl('h2', { text: 'About you' });
		contentEl.createEl('p', {
			text: 'These fields generate _agent/user.md — how the agent models you. Edit it freely at any time.',
			cls: 'agent-wizard-desc',
		});

		new Setting(contentEl)
			.setName('How you work')
			.setDesc('Work style, rhythm, tools, or context the agent should know.')
			.addTextArea(ta => {
				ta.setValue(this.workStyle)
					.setPlaceholder('I work in focused 2-hour blocks. I prefer async communication.')
					.onChange(v => { this.workStyle = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName('Communication preferences')
			.setDesc('How do you want responses structured?')
			.addTextArea(ta => {
				ta.setValue(this.commPreferences)
					.setPlaceholder('Short answers by default. Offer to expand if needed.')
					.onChange(v => { this.commPreferences = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName('Current areas of focus')
			.setDesc('Topics or projects you\'re working on right now.')
			.addTextArea(ta => {
				ta.setValue(this.interests)
					.setPlaceholder('Building an Obsidian plugin, learning TypeScript.')
					.onChange(v => { this.interests = v; });
				ta.inputEl.rows = 3;
			});

		this.renderNav(
			() => { this.step = 3; this.render(); },
			() => { this.step = 5; this.render(); },
		);
	}

	// — Step 5: Tags —

	private renderStep5() {
		const { contentEl } = this;
		this.renderEmoji(contentEl, '🏷️');
		contentEl.createEl('h2', { text: 'Initial tag taxonomy' });
		contentEl.createEl('p', {
			text: 'Select the topic tags to activate in _agent/taxonomy.md. The agent can only assign tags from this list. You can add more directly in the file at any time.',
			cls: 'agent-wizard-desc',
		});

		for (const tag of SUGGESTED_TAGS) {
			new Setting(contentEl)
				.setName(tag)
				.addToggle(toggle => toggle
					.setValue(this.selectedTags.has(tag))
					.onChange(v => {
						if (v) this.selectedTags.add(tag);
						else this.selectedTags.delete(tag);
					}));
		}

		this.renderNav(
			() => { this.step = 4; this.render(); },
			() => {
				this.finishState = 'loading';
				this.step = 6;
				this.render();
				void this.runFinish();
			},
			'Finish',
		);
	}

	// — Step 6: Loading / Success / Error —

	private renderStep6() {
		const { contentEl } = this;

		if (this.finishState === 'loading') {
			this.renderEmoji(contentEl, '⚙️');
			contentEl.createEl('h2', { text: 'Setting up your agent…' });
			contentEl.createEl('p', {
				text: 'Generating your agent\'s soul and creating vault files. This may take a few seconds.',
				cls: 'agent-wizard-desc',
			});
		} else if (this.finishState === 'done') {
			this.renderEmoji(contentEl, '🎉');
			contentEl.createEl('h2', { text: 'You\'re all set!' });
			contentEl.createEl('p', {
				text: `Your agent "${this.agentName || 'Agent'}" has been initialized with ${this.selectedTags.size} active tags. All files are ready in your vault under _agent/.`,
				cls: 'agent-wizard-desc',
			});
			contentEl.createEl('p', {
				text: 'Open the chat to start your first conversation. You can access it anytime from the ribbon or the command palette.',
				cls: 'agent-wizard-desc',
			});

			const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav agent-wizard-nav--center' });
			const openBtn = navEl.createEl('button', {
				text: 'Open chat',
				cls: 'mod-cta',
			});
			openBtn.addEventListener('click', () => {
				this.close();
				this.plugin.openChatView();
			});
		} else {
			this.renderEmoji(contentEl, '❌');
			contentEl.createEl('h2', { text: 'Setup failed' });
			contentEl.createEl('p', {
				text: this.finishError || 'An unexpected error occurred.',
				cls: 'agent-wizard-desc',
			});

			this.renderNav(
				() => { this.step = 5; this.render(); },
				() => {
					this.finishState = 'loading';
					this.render();
					void this.runFinish();
				},
				'Try again',
			);
		}
	}

	// — Helpers —

	private renderEmoji(container: HTMLElement, emoji: string) {
		container.createEl('div', { text: emoji, cls: 'agent-wizard-emoji' });
	}

	private renderNav(
		onBack: (() => void) | null,
		onNext: (() => void) | null,
		nextLabel = 'Next',
	) {
		const hasBoth = !!onBack && !!onNext;
		const navEl = this.contentEl.createDiv({
			cls: 'agent-wizard-nav' + (hasBoth ? ' agent-wizard-nav--split' : ''),
		});

		if (onBack) {
			const backBtn = navEl.createEl('button', { text: 'Back' });
			backBtn.addEventListener('click', onBack);
		}

		if (onNext) {
			const nextBtn = navEl.createEl('button', {
				text: nextLabel,
				cls: 'mod-cta',
			});
			nextBtn.addEventListener('click', onNext);
		}
	}

	// — Soul generation —

	private async generateSoul(): Promise<string> {
		const client = new OpenRouterClient(
			this.apiKey,
			this.modelSlug || 'openai/gpt-4o',
		);

		const userMessage = [
			`Agent name: ${this.agentName || 'Agent'}`,
			'',
			`Core purpose: ${this.corePurpose}`,
			'',
			`Core values: ${this.coreValues}`,
			'',
			`Voice and tone: ${this.voiceTone}`,
		].join('\n');

		return await client.chat([
			{ role: 'system', content: SOUL_GENERATION_PROMPT },
			{ role: 'user', content: userMessage },
		], { temperature: 0.7 });
	}

	// — Finish —

	private async runFinish(): Promise<void> {
		const formHasContent = !!(
			this.corePurpose.trim() ||
			this.coreValues.trim() ||
			this.voiceTone.trim()
		);

		let soulBody: string;

		if (!formHasContent) {
			soulBody = SOUL_FALLBACK;
		} else {
			try {
				soulBody = await this.generateSoul();
			} catch {
				soulBody = SOUL_FALLBACK;
			}
		}

		try {
			const now = new Date();
			const date = now.toISOString().slice(0, 10);
			const datetime = now.toISOString().slice(0, 16);

			this.plugin.settings.agentName = this.agentName || 'Agent';
			this.plugin.settings.apiKey = this.apiKey;
			this.plugin.settings.modelSlug = this.modelSlug || 'openai/gpt-4o';
			await this.plugin.saveSettings();

			await this.vaultManager.ensurePath('_agent/memory/episodes');
			await this.vaultManager.ensurePath('_agent/memory/items/_pending');
			await this.vaultManager.ensurePath('_system/traces');

			await this.vaultManager.writeFile('_agent/soul.md', [
				'---',
				'kind: agent_soul',
				'state: active',
				`agent_name: "${this.agentName || 'Agent'}"`,
				`created_at: ${date}`,
				`updated_at: ${date}`,
				'origin: hybrid',
				'---',
				'',
				soulBody,
			].join('\n'));

			await this.vaultManager.writeFile('_agent/user.md', [
				'---',
				'kind: agent_user',
				'state: active',
				`created_at: ${date}`,
				`updated_at: ${date}`,
				'origin: hybrid',
				'---',
				'',
				'## Work style',
				'',
				this.workStyle || 'To be defined.',
				'',
				'## Communication preferences',
				'',
				this.commPreferences || 'To be defined.',
				'',
				'## Current areas of focus',
				'',
				this.interests || 'To be defined.',
				'',
				'## Patterns to avoid',
				'',
				'## Relevant personal context',
			].join('\n'));

			const activeTags = [...this.selectedTags].join('\n');
			await this.vaultManager.writeFile('_agent/taxonomy.md', [
				'---',
				'kind: agent_taxonomy',
				`updated_at: ${date}`,
				'origin: human',
				'---',
				'',
				'## Active topics',
				'',
				activeTags,
				'',
				'## Pending proposals',
			].join('\n'));

			await this.vaultManager.writeFile('_agent/memory/active.md', [
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

			this.finishState = 'done';
			this.render();
		} catch (e) {
			this.finishError = e instanceof Error ? e.message : String(e);
			this.finishState = 'error';
			this.render();
		}
	}
}
