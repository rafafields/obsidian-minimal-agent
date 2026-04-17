import { App, Modal, Notice } from 'obsidian';
import type { VaultManager } from '../vault/VaultManager';
import type { FrontmatterParser } from '../vault/FrontmatterParser';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { SOUL_GENERATION_PROMPT, SOUL_FALLBACK, parseLoadingPhrases } from '../wizard/soulInstructions';
import { createMascotImg } from '../ui/mascot';
import { LoadingScreen } from '../ui/LoadingScreen';
import { SoulForm, type SoulFormState } from '../ui/SoulForm';
import { SoulManager } from './SoulManager';
import { LANGUAGES, detectDefaultLanguage, t } from '../utils/language';
import { wrapLink } from '../utils/links';
import { Setting } from 'obsidian';

type GenState = 'form' | 'generating' | 'done' | 'error';

export class SoulGeneratorModal extends Modal {
	private soulFormState: SoulFormState = { name: '', emoji: '🤖', corePurpose: '', coreValues: '', voiceTone: '', soulModelSlug: '' };
	private language = detectDefaultLanguage();
	private state: GenState = 'form';
	private errorMsg = '';
	private generatedId = '';
	private loadingScreen: LoadingScreen | null = null;

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
		const L = this.language;
		contentEl.createEl('h2', { text: t('soul_gen_title', L) });
		contentEl.createEl('p', { text: t('soul_gen_desc', L), cls: 'agent-wizard-desc' });

		new SoulForm(contentEl, this.soulFormState, L, {
			name: t('soul_gen_name_name', L),
			desc: t('soul_gen_name_desc', L),
			placeholder: t('soul_gen_name_ph', L),
		}).render();

		new Setting(contentEl)
			.setName(t('language', L))
			.setDesc(t('soul_gen_language_desc', L))
			.addDropdown(dd => {
				for (const lang of Object.keys(LANGUAGES)) dd.addOption(lang, lang);
				dd.setValue(this.language).onChange(v => { this.language = v; });
			});

		const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav' });
		const cancelBtn = navEl.createEl('button', { text: t('cancel', L) });
		cancelBtn.addEventListener('click', () => { this.close(); });

		const generateBtn = navEl.createEl('button', { text: t('generate', L), cls: 'mod-cta' });
		generateBtn.addEventListener('click', () => {
			if (!this.soulFormState.name) {
				new Notice(t('soul_gen_name_required', L));
				return;
			}
			this.state = 'generating';
			this.render();
			void this.runGeneration();
		});
	}

	// — Generating —

	private renderGenerating() {
		const L = this.language;
		this.loadingScreen = new LoadingScreen(this.contentEl, t('soul_gen_generating_title', L), t('starting', L));
	}

	private setStatus(text: string) {
		this.loadingScreen?.setStatus(text);
	}

	// — Done —

	private renderDone() {
		const { contentEl } = this;
		const L = this.language;
		const wrapper = contentEl.createDiv({ cls: 'agent-wizard-mascot' });
		createMascotImg(wrapper, 'inlove', 'agent-wizard-mascot-img');
		contentEl.createEl('h2', { text: t('soul_gen_done_title', L) });
		contentEl.createEl('p', {
			text: t('soul_gen_done_desc', L, { name: this.soulFormState.name, id: this.generatedId }),
			cls: 'agent-wizard-desc',
		});

		const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav' });
		const closeBtn = navEl.createEl('button', { text: t('close', L), cls: 'mod-cta' });
		closeBtn.addEventListener('click', () => { this.close(); });
	}

	// — Error —

	private renderError() {
		const { contentEl } = this;
		const L = this.language;
		contentEl.createEl('h2', { text: t('soul_gen_error_title', L) });
		contentEl.createEl('p', {
			text: this.errorMsg || t('error_unexpected', L),
			cls: 'agent-wizard-desc',
		});

		const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav agent-wizard-nav--split' });
		const backBtn = navEl.createEl('button', { text: t('back', L) });
		backBtn.addEventListener('click', () => { this.state = 'form'; this.render(); });

		const retryBtn = navEl.createEl('button', { text: t('try_again', L), cls: 'mod-cta' });
		retryBtn.addEventListener('click', () => {
			this.state = 'generating';
			this.render();
			void this.runGeneration();
		});
	}

	// — Generation —

	private async runGeneration(): Promise<void> {
		const s = this.soulFormState;
		const id = SoulManager.nameToId(s.name);
		const hasContent = !!(s.corePurpose.trim() || s.coreValues.trim() || s.voiceTone.trim());

		this.setStatus(t('soul_gen_generating_soul', this.language));

		let body: string;
		let loadingPhrases: string[] = [];
		try {
			if (hasContent) {
				const client = new OpenRouterClient(this.apiKey, this.modelSlug || 'anthropic/claude-sonnet-4.6');
				const userMessage = [
					`Soul name: ${s.name}`,
					'',
					`Core purpose: ${s.corePurpose}`,
					'',
					`Core values: ${s.coreValues}`,
					'',
					`Voice and tone: ${s.voiceTone}`,
					'',
					`Write the entire document in ${this.language}.`,
				].join('\n');

				const { content } = await client.chat([
					{ role: 'system', content: SOUL_GENERATION_PROMPT },
					{ role: 'user', content: userMessage },
				], { temperature: 0.7 });
				const parsed = parseLoadingPhrases(content);
				body = parsed.cleanBody;
				loadingPhrases = parsed.phrases;
			} else {
				body = SOUL_FALLBACK;
			}
		} catch {
			body = SOUL_FALLBACK;
		}

		this.setStatus(t('soul_gen_generating_file', this.language));

		try {
			const now = new Date();
			const date = now.toISOString().slice(0, 10);

			const fm: Record<string, unknown> = {
				name: s.name,
				emoji: s.emoji,
				kind: wrapLink('agent_soul'),
				state: wrapLink('active'),
				created_at: date,
				updated_at: date,
				origin: wrapLink('hybrid'),
			};
			if (s.soulModelSlug) fm['model_slug'] = s.soulModelSlug;
			if (loadingPhrases.length > 0) fm['loading_phrases'] = loadingPhrases;

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
