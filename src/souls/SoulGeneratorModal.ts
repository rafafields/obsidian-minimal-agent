import { App, Modal, Notice, Setting } from 'obsidian';
import type { VaultManager } from '../vault/VaultManager';
import type { FrontmatterParser } from '../vault/FrontmatterParser';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { SOUL_GENERATION_PROMPT, SOUL_FALLBACK, parseLoadingPhrases } from '../wizard/soulInstructions';
import { createMascotImg } from '../ui/mascot';
import { LoadingScreen } from '../ui/LoadingScreen';
import { EmojiPicker } from '../ui/EmojiPicker';
import { SoulManager } from './SoulManager';
import { LANGUAGES, detectDefaultLanguage, t } from '../utils/language';
import { CURATED_MODELS, CUSTOM_MODEL_OPTION, findCuratedModel } from '../llm/curatedModels';

type GenState = 'form' | 'generating' | 'done' | 'error';

export class SoulGeneratorModal extends Modal {
	private name = '';
	private emoji = '🤖';
	private corePurpose = '';
	private coreValues = '';
	private voiceTone = '';
	private soulModelSlug = '';
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

		new Setting(contentEl)
			.setName(t('soul_gen_name_name', L))
			.setDesc(t('soul_gen_name_desc', L))
			.addText(text => text
				.setPlaceholder(t('soul_gen_name_ph', L))
				.setValue(this.name)
				.onChange(v => { this.name = v.trim(); }));

		const emojiSetting = new Setting(contentEl)
			.setName(t('soul_emoji', L))
			.setDesc(t('soul_emoji_desc', L));
		new EmojiPicker(emojiSetting.controlEl, this.emoji, (v) => { this.emoji = v; });

		new Setting(contentEl)
			.setName(t('core_purpose', L))
			.setDesc(t('core_purpose_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.corePurpose)
					.setPlaceholder(t('core_purpose_placeholder', L))
					.onChange(v => { this.corePurpose = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('core_values', L))
			.setDesc(t('core_values_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.coreValues)
					.setPlaceholder(t('core_values_placeholder', L))
					.onChange(v => { this.coreValues = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('voice_tone', L))
			.setDesc(t('voice_tone_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.voiceTone)
					.setPlaceholder(t('voice_tone_placeholder', L))
					.onChange(v => { this.voiceTone = v; });
				ta.inputEl.rows = 3;
			});

		// — Soul-specific model override —
		const isCustomModel = !!this.soulModelSlug && !findCuratedModel(this.soulModelSlug);
		const modelSettingEl = contentEl.createDiv();
		const modelSetting = new Setting(modelSettingEl)
			.setName(t('model', L))
			.setDesc(t('soul_model_desc', L));
		const modelSelectEl = modelSetting.controlEl.createEl('select', { cls: 'dropdown' });
		modelSelectEl.createEl('option', { text: t('soul_model_global', L), value: '' });
		for (const m of CURATED_MODELS) {
			modelSelectEl.createEl('option', { text: `${m.displayName} (${m.provider})`, value: m.slug });
		}
		modelSelectEl.createEl('option', { text: 'Custom…', value: CUSTOM_MODEL_OPTION });
		modelSelectEl.value = isCustomModel ? CUSTOM_MODEL_OPTION : (this.soulModelSlug || '');

		const customModelEl = modelSettingEl.createDiv({ cls: 'agent-wizard-field' });
		customModelEl.style.display = isCustomModel ? '' : 'none';
		customModelEl.createEl('label', { text: t('custom_model_slug', L), cls: 'agent-wizard-field__label' });
		const customModelInput = customModelEl.createEl('input', {
			cls: 'agent-wizard-field__input',
			attr: { type: 'text', placeholder: 'provider/model-name' },
		});
		customModelInput.value = isCustomModel ? this.soulModelSlug : '';
		customModelInput.addEventListener('input', () => { this.soulModelSlug = customModelInput.value.trim(); });

		modelSelectEl.addEventListener('change', () => {
			const v = modelSelectEl.value;
			if (v === CUSTOM_MODEL_OPTION) {
				customModelEl.style.display = '';
				this.soulModelSlug = customModelInput.value.trim();
			} else {
				customModelEl.style.display = 'none';
				this.soulModelSlug = v;
			}
		});

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
			if (!this.name) {
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
			text: t('soul_gen_done_desc', L, { name: this.name, id: this.generatedId }),
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
		const id = SoulManager.nameToId(this.name);
		const hasContent = !!(this.corePurpose.trim() || this.coreValues.trim() || this.voiceTone.trim());

		this.setStatus(t('soul_gen_generating_soul', this.language));

		let body: string;
		let loadingPhrases: string[] = [];
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
				name: this.name,
				emoji: this.emoji,
				kind: 'agent_soul',
				state: 'active',
				created_at: date,
				updated_at: date,
				origin: 'hybrid',
			};
			if (this.soulModelSlug) fm['model_slug'] = this.soulModelSlug;
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
