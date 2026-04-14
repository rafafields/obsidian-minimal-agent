import { App, Modal, Notice, Setting } from 'obsidian';
import type { VaultManager } from '../vault/VaultManager';
import type { FrontmatterParser } from '../vault/FrontmatterParser';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { SOUL_GENERATION_PROMPT, SOUL_FALLBACK } from '../wizard/soulInstructions';
import { createMascotImg } from '../ui/mascot';
import { SoulManager } from './SoulManager';
import { LANGUAGES, detectDefaultLanguage } from '../utils/language';

type GenState = 'form' | 'generating' | 'done' | 'error';

export class SoulGeneratorModal extends Modal {
	private name = '';
	private emoji = '✨';
	private corePurpose = '';
	private coreValues = '';
	private voiceTone = '';
	private language = detectDefaultLanguage();
	private state: GenState = 'form';
	private errorMsg = '';
	private generatedId = '';
	private statusEl: HTMLElement | null = null;

	constructor(
		app: App,
		private vaultManager: VaultManager,
		private parser: FrontmatterParser,
		private apiKey: string,
		private modelSlug: string,
		private onComplete: (id: string) => void,
		initialLanguage?: string,
	) {
		super(app);
		if (initialLanguage) this.language = initialLanguage;
	}

	onOpen() {
		this.modalEl.addClass('agent-soul-generator-modal');
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		switch (this.state) {
			case 'form':     this.renderForm(); break;
			case 'generating': this.renderGenerating(); break;
			case 'done':     this.renderDone(); break;
			case 'error':    this.renderError(); break;
		}
	}

	// — Form —

	private renderForm() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Create a new soul' });
		contentEl.createEl('p', {
			text: 'Define the identity of this soul. These fields generate a soul file in _agent/souls/. You can edit it directly in Obsidian at any time.',
			cls: 'agent-wizard-desc',
		});

		new Setting(contentEl)
			.setName('Soul name')
			.setDesc('Display name for this soul (e.g. "Sofia").')
			.addText(text => text
				.setPlaceholder('My Agent')
				.setValue(this.name)
				.onChange(v => { this.name = v.trim(); }));

		new Setting(contentEl)
			.setName('Emoji')
			.setDesc('Single emoji shown in the soul selector.')
			.addText(text => text
				.setPlaceholder('✨')
				.setValue(this.emoji)
				.onChange(v => { this.emoji = v.trim() || '✨'; }));

		new Setting(contentEl)
			.setName('Core purpose')
			.setDesc('What is this soul fundamentally for? (2–3 sentences)')
			.addTextArea(ta => {
				ta.setValue(this.corePurpose)
					.setPlaceholder('A thinking companion for focused creative work.')
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

		new Setting(contentEl)
			.setName('Language')
			.setDesc('Language for the generated soul document.')
			.addDropdown(dd => {
				for (const lang of Object.keys(LANGUAGES)) dd.addOption(lang, lang);
				dd.setValue(this.language).onChange(v => { this.language = v; });
			});

		const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav' });
		const cancelBtn = navEl.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => { this.close(); });

		const generateBtn = navEl.createEl('button', { text: 'Generate', cls: 'mod-cta' });
		generateBtn.addEventListener('click', () => {
			if (!this.name) {
				new Notice('Soul name is required.');
				return;
			}
			this.state = 'generating';
			this.render();
			void this.runGeneration();
		});
	}

	// — Generating —

	private renderGenerating() {
		const { contentEl } = this;
		const wrapper = contentEl.createDiv({ cls: 'agent-wizard-mascot' });
		createMascotImg(wrapper, 'thinking', 'agent-wizard-mascot-img');
		contentEl.createEl('h2', { text: 'Generating soul…' });
		this.statusEl = contentEl.createEl('p', {
			text: 'Starting…',
			cls: 'agent-wizard-loading-status',
		});
	}

	private setStatus(text: string) {
		if (this.statusEl) this.statusEl.setText(text);
	}

	// — Done —

	private renderDone() {
		const { contentEl } = this;
		const wrapper = contentEl.createDiv({ cls: 'agent-wizard-mascot' });
		createMascotImg(wrapper, 'inlove', 'agent-wizard-mascot-img');
		contentEl.createEl('h2', { text: 'Soul created!' });
		contentEl.createEl('p', {
			text: `"${this.name}" has been saved to _agent/souls/${this.generatedId}.md.`,
			cls: 'agent-wizard-desc',
		});

		const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav' });
		const closeBtn = navEl.createEl('button', { text: 'Close', cls: 'mod-cta' });
		closeBtn.addEventListener('click', () => { this.close(); });
	}

	// — Error —

	private renderError() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Generation failed' });
		contentEl.createEl('p', {
			text: this.errorMsg || 'An unexpected error occurred.',
			cls: 'agent-wizard-desc',
		});

		const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav agent-wizard-nav--split' });
		const backBtn = navEl.createEl('button', { text: 'Back' });
		backBtn.addEventListener('click', () => { this.state = 'form'; this.render(); });

		const retryBtn = navEl.createEl('button', { text: 'Try again', cls: 'mod-cta' });
		retryBtn.addEventListener('click', () => {
			this.state = 'generating';
			this.render();
			void this.runGeneration();
		});
	}

	// — Generation —

	private async runGeneration(): Promise<void> {
		const id = SoulManager.nameToId(this.name);
		const hasContent = !!(this.corePurpose.trim() || this.coreValues.trim() || this.voiceTone.trim());

		this.setStatus('Generating soul document…');

		let body: string;
		try {
			if (hasContent) {
				const client = new OpenRouterClient(this.apiKey, this.modelSlug || 'qwen/qwen3.5-27b');
				const userMessage = [
					`Soul name: ${this.name}`,
					'',
					`Core purpose: ${this.corePurpose}`,
					'',
					`Core values: ${this.coreValues}`,
					'',
					`Voice and tone: ${this.voiceTone}`,
					'',
					`Write the entire document in ${this.language}.`,
				].join('\n');

				const { content } = await client.chat([
					{ role: 'system', content: SOUL_GENERATION_PROMPT },
					{ role: 'user', content: userMessage },
				], { temperature: 0.7 });
				body = content;
			} else {
				body = SOUL_FALLBACK;
			}
		} catch {
			body = SOUL_FALLBACK;
		}

		this.setStatus('Writing file…');

		try {
			const now = new Date();
			const date = now.toISOString().slice(0, 10);

			const fm: Record<string, unknown> = {
				name: this.name,
				emoji: this.emoji,
				kind: 'agent_soul',
				state: 'active',
				created_at: date,
				updated_at: date,
				origin: 'hybrid',
			};

			await this.vaultManager.writeFile(
				`_agent/souls/${id}.md`,
				this.parser.serialize(fm, body),
			);

			this.generatedId = id;
			this.state = 'done';
			this.render();
			this.onComplete(id);
		} catch (e) {
			this.errorMsg = e instanceof Error ? e.message : String(e);
			this.state = 'error';
			this.render();
		}
	}
}
