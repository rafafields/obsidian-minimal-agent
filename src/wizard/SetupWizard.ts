import { App, Modal, Notice, Setting } from 'obsidian';
import type MinimalAgentPlugin from '../main';
import type { VaultManager } from '../vault/VaultManager';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { SOUL_GENERATION_PROMPT, SOUL_FALLBACK, USER_GENERATION_PROMPT, parseLoadingPhrases } from './soulInstructions';
import { calcCost, formatCost } from '../utils/tokens';
import type { LLMUsage } from '../types';
import { createMascotImg, type MascotState } from '../ui/mascot';
import { LoadingScreen } from '../ui/LoadingScreen';
import { SoulForm, type SoulFormState } from '../ui/SoulForm';
import { CURATED_MODELS, CUSTOM_MODEL_OPTION, findCuratedModel } from '../llm/curatedModels';
import { SoulManager } from '../souls/SoulManager';
import { LANGUAGES, detectDefaultLanguage, t } from '../i18n';
import { initVault } from './WizardVaultInit';

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
	private soulFormState: SoulFormState = { name: '', emoji: '🤖', corePurpose: '', coreValues: '', voiceTone: '', soulModelSlug: '' };
	private apiKey: string;
	private modelSlug: string;
	private workStyle = '';
	private commPreferences = '';
	private interests = '';
	private longTermGoals = '';
	private personalContext = '';
	private patternsToAvoid = '';
	private selectedTags: Set<string>;
	private language: string;
	private finishState: FinishState = 'loading';
	private finishError = '';
	private loadingScreen: LoadingScreen | null = null;
	private generationCost: number | null = null;

	constructor(
		app: App,
		private plugin: MinimalAgentPlugin,
		private vaultManager: VaultManager,
	) {
		super(app);
		this.apiKey = plugin.settings.apiKey;
		this.modelSlug = plugin.settings.modelSlug;
		this.selectedTags = new Set(SUGGESTED_TAGS);
		this.language = plugin.settings.language || detectDefaultLanguage();
	}

	static isFirstRun(app: App): boolean {
		return app.vault.getAbstractFileByPath('_agent/souls') === null;
	}

	onOpen() {
		this.modalEl.addClass('agent-wizard-modal');
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private isCenteredStep(): boolean {
		return this.step === 1 ||
			(this.step === 6 && this.finishState !== 'error');
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.toggleClass('agent-wizard-centered', this.isCenteredStep());

		if (this.step <= TOTAL_STEPS) {
			contentEl.createEl('p', {
				text: t('wizard_step_of', this.language, { step: String(this.step), total: String(TOTAL_STEPS) }),
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
		const L = this.language;
		this.renderMascot(contentEl, 'inlove');
		contentEl.createEl('h2', { text: t('wizard_welcome_title', L) });
		contentEl.createEl('p', { text: t('wizard_welcome_desc1', L), cls: 'agent-wizard-desc' });
		contentEl.createEl('p', { text: t('wizard_welcome_desc2', L), cls: 'agent-wizard-desc' });

		new Setting(contentEl)
			.setName(t('language', L))
			.setDesc(t('wizard_welcome_language_desc', L))
			.addDropdown(dd => {
				for (const lang of Object.keys(LANGUAGES)) {
					dd.addOption(lang, lang);
				}
				dd.setValue(this.language).onChange(v => {
					this.language = v;
					this.plugin.settings.language = v;
					void this.plugin.saveSettings();
				});
			});

		this.renderNav(null, () => { this.step = 2; this.render(); }, t('wizard_get_started', L));
	}

	// — Step 2: API config —

	private renderStep2() {
		const { contentEl } = this;
		const L = this.language;

		contentEl.createEl('h2', { text: t('wizard_api_title', L) });
		contentEl.createEl('p', { text: t('wizard_api_desc', L), cls: 'agent-wizard-desc' });

		const apiFieldEl = contentEl.createDiv({ cls: 'agent-wizard-field' });
		apiFieldEl.createEl('label', { text: t('wizard_api_key_name', L), cls: 'agent-wizard-field__label' });
		const apiInput = apiFieldEl.createEl('input', {
			cls: 'agent-wizard-field__input',
			attr: { type: 'password', placeholder: 'sk-or-...' },
		});
		apiInput.value = this.apiKey;
		apiInput.addEventListener('input', () => { this.apiKey = apiInput.value.trim(); });

		const signupEl = contentEl.createDiv({ cls: 'agent-wizard-link-hint' });
		signupEl.createSpan({ text: t('openrouter_no_account', L) + ' ' });
		const signupLink = signupEl.createEl('a', { text: t('openrouter_signup_link', L) });
		signupLink.addEventListener('click', (e) => {
			e.preventDefault();
			window.open('https://openrouter.ai/', '_blank');
		});

		contentEl.createEl('hr', { cls: 'agent-wizard-separator' });
		contentEl.createEl('h3', { text: t('model', L), cls: 'agent-wizard-section-title' });

		const modelDescEl = contentEl.createDiv({ cls: 'agent-wizard-desc' });
		const [descBefore, descAfter] = t('wizard_model_desc', L).split('{zdr}');
		modelDescEl.createSpan({ text: descBefore ?? '' });
		const zdrDescLink = modelDescEl.createEl('a', { text: 'ZDR ✓', cls: 'agent-wizard-zdr-link' });
		zdrDescLink.addEventListener('click', (e) => {
			e.preventDefault();
			window.open('https://openrouter.ai/docs/guides/features/zdr', '_blank');
		});
		modelDescEl.createSpan({ text: descAfter ?? '' });

		const isCustomSlug = !findCuratedModel(this.modelSlug);
		const modelFieldEl = contentEl.createDiv({ cls: 'agent-wizard-field' });
		const modelSelect = modelFieldEl.createEl('select', { cls: 'agent-wizard-field__select dropdown' });
		for (const m of CURATED_MODELS) {
			modelSelect.createEl('option', { text: `${m.displayName} (${m.provider})`, value: m.slug });
		}
		modelSelect.createEl('option', { text: 'Custom…', value: CUSTOM_MODEL_OPTION });
		modelSelect.value = isCustomSlug ? CUSTOM_MODEL_OPTION : this.modelSlug;

		const customFieldEl = contentEl.createDiv({ cls: 'agent-wizard-field' });
		customFieldEl.style.display = isCustomSlug ? '' : 'none';
		customFieldEl.createEl('label', { text: t('custom_model_slug', L), cls: 'agent-wizard-field__label' });
		const customInput = customFieldEl.createEl('input', {
			cls: 'agent-wizard-field__input',
			attr: { type: 'text', placeholder: 'provider/model-name' },
		});
		customInput.value = isCustomSlug ? this.modelSlug : '';
		customInput.addEventListener('input', () => { this.modelSlug = customInput.value.trim(); });

		const modelCardEl = contentEl.createDiv({ cls: 'agent-wizard-model-card' });
		modelCardEl.style.display = isCustomSlug ? 'none' : '';

		const refreshModelCard = (slug: string) => {
			modelCardEl.empty();
			const model = findCuratedModel(slug);
			if (!model) { modelCardEl.style.display = 'none'; return; }
			modelCardEl.style.display = '';
			if (model.zdr) {
				modelCardEl.createSpan({ text: 'ZDR', cls: 'agent-wizard-model-card__zdr' });
			}
			const headerEl = modelCardEl.createDiv({ cls: 'agent-wizard-model-card__header' });
			headerEl.createSpan({ text: `${model.displayName} · ${model.provider}`, cls: 'agent-wizard-model-card__name' });
			modelCardEl.createDiv({
				text: `Input: $${model.inputPricePerM.toFixed(2)} / 1M · Output: $${model.outputPricePerM.toFixed(2)} / 1M`,
				cls: 'agent-wizard-model-card__price',
			});
			modelCardEl.createDiv({ text: model.description, cls: 'agent-wizard-model-card__desc' });
		};

		modelSelect.addEventListener('change', () => {
			const v = modelSelect.value;
			if (v === CUSTOM_MODEL_OPTION) {
				customFieldEl.style.display = '';
				modelCardEl.style.display = 'none';
				modelCardEl.empty();
			} else {
				this.modelSlug = v;
				customFieldEl.style.display = 'none';
				refreshModelCard(v);
			}
		});

		if (!isCustomSlug) refreshModelCard(this.modelSlug);

		this.renderNav(
			() => { this.step = 1; this.render(); },
			() => {
				if (!this.apiKey) {
					new Notice(t('wizard_api_key_required', L));
					return;
				}
				this.step = 3;
				this.render();
			},
		);
	}

	// — Step 3: About you —

	private renderStep3() {
		const { contentEl } = this;
		const L = this.language;
		contentEl.createEl('h2', { text: t('wizard_about_you_title', L) });
		contentEl.createEl('p', { text: t('wizard_about_you_desc', L), cls: 'agent-wizard-desc' });

		new Setting(contentEl)
			.setName(t('wizard_work_style_name', L))
			.setDesc(t('wizard_work_style_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.workStyle).setPlaceholder(t('wizard_work_style_ph', L)).onChange(v => { this.workStyle = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('wizard_comm_prefs_name', L))
			.setDesc(t('wizard_comm_prefs_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.commPreferences).setPlaceholder(t('wizard_comm_prefs_ph', L)).onChange(v => { this.commPreferences = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('wizard_focus_name', L))
			.setDesc(t('wizard_focus_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.interests).setPlaceholder(t('wizard_focus_ph', L)).onChange(v => { this.interests = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('wizard_long_term_goals_name', L))
			.setDesc(t('wizard_long_term_goals_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.longTermGoals).setPlaceholder(t('wizard_long_term_goals_ph', L)).onChange(v => { this.longTermGoals = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('wizard_personal_context_name', L))
			.setDesc(t('wizard_personal_context_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.personalContext).setPlaceholder(t('wizard_personal_context_ph', L)).onChange(v => { this.personalContext = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(contentEl)
			.setName(t('wizard_patterns_to_avoid_name', L))
			.setDesc(t('wizard_patterns_to_avoid_desc', L))
			.addTextArea(ta => {
				ta.setValue(this.patternsToAvoid).setPlaceholder(t('wizard_patterns_to_avoid_ph', L)).onChange(v => { this.patternsToAvoid = v; });
				ta.inputEl.rows = 3;
			});

		this.renderNav(
			() => { this.step = 2; this.render(); },
			() => { this.step = 4; this.render(); },
		);
	}

	// — Step 4: Define agent —

	private renderStep4() {
		const { contentEl } = this;
		const L = this.language;
		contentEl.createEl('h2', { text: t('wizard_define_title', L) });
		contentEl.createEl('p', { text: t('wizard_define_desc', L), cls: 'agent-wizard-desc' });

		new SoulForm(contentEl, this.soulFormState, L, {
			name: t('wizard_agent_name_name', L),
			desc: t('wizard_agent_name_desc', L),
			placeholder: 'Agent',
		}).render();

		this.renderNav(
			() => { this.step = 3; this.render(); },
			() => { this.step = 5; this.render(); },
		);
	}

	// — Step 5: Tags —

	private renderStep5() {
		const { contentEl } = this;
		const L = this.language;
		contentEl.createEl('h2', { text: t('wizard_tags_title', L) });
		contentEl.createEl('p', { text: t('wizard_tags_desc', L), cls: 'agent-wizard-desc' });

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
			t('finish', L),
		);
	}

	// — Step 6: Loading / Success / Error —

	private renderStep6() {
		const { contentEl } = this;
		const L = this.language;

		if (this.finishState === 'loading') {
			this.loadingScreen = new LoadingScreen(contentEl, t('wizard_loading_title', L), t('starting', L));
		} else if (this.finishState === 'done') {
			this.renderMascot(contentEl, 'inlove');
			contentEl.createEl('h2', { text: t('wizard_done_title', L) });
			contentEl.createEl('p', {
				text: t('wizard_done_desc', L, { name: this.soulFormState.name || 'Agent', tags: String(this.selectedTags.size) }),
				cls: 'agent-wizard-desc',
			});
			if (this.generationCost !== null) {
				contentEl.createEl('p', {
					text: t('wizard_done_cost', L, { cost: formatCost(this.generationCost) }),
					cls: 'agent-wizard-desc agent-wizard-cost',
				});
			}
			contentEl.createEl('p', { text: t('wizard_done_open_desc', L), cls: 'agent-wizard-desc' });

			const navEl = contentEl.createDiv({ cls: 'agent-wizard-nav agent-wizard-nav--center' });
			const openBtn = navEl.createEl('button', { text: t('wizard_open_chat', L), cls: 'mod-cta' });
			openBtn.addEventListener('click', () => {
				this.close();
				this.plugin.openChatView();
			});
		} else {
			contentEl.createEl('h2', { text: t('wizard_error_title', L) });
			contentEl.createEl('p', {
				text: this.finishError || t('error_unexpected', L),
				cls: 'agent-wizard-desc',
			});

			this.renderNav(
				() => { this.step = 5; this.render(); },
				() => {
					this.finishState = 'loading';
					this.render();
					void this.runFinish();
				},
				t('try_again', L),
			);
		}
	}

	// — Helpers —

	private updateLoadingStatus(text: string): void {
		this.loadingScreen?.setStatus(text);
	}

	private renderMascot(container: HTMLElement, state: MascotState) {
		const wrapper = container.createDiv({ cls: 'agent-wizard-mascot' });
		createMascotImg(wrapper, state, 'agent-wizard-mascot-img');
	}

	private renderNav(
		onBack: (() => void) | null,
		onNext: (() => void) | null,
		nextLabel?: string,
	) {
		nextLabel ??= t('next', this.language);
		const hasBoth = !!onBack && !!onNext;
		const navEl = this.contentEl.createDiv({
			cls: 'agent-wizard-nav' + (hasBoth ? ' agent-wizard-nav--split' : ''),
		});

		if (onBack) {
			const backBtn = navEl.createEl('button', { text: t('back', this.language) });
			backBtn.addEventListener('click', onBack);
		}

		if (onNext) {
			const nextBtn = navEl.createEl('button', { text: nextLabel, cls: 'mod-cta' });
			nextBtn.addEventListener('click', onNext);
		}
	}

	// — LLM generation —

	private makeClient(): OpenRouterClient {
		return new OpenRouterClient(this.apiKey, this.modelSlug || 'anthropic/claude-sonnet-4.6');
	}

	private async generateSoul(): Promise<{ body: string; usage: LLMUsage }> {
		const s = this.soulFormState;
		const userMessage = [
			`Language: Write the entire document in ${this.language}.`,
			'',
			`Agent name: ${s.name || 'Agent'}`,
			`Core purpose: ${s.corePurpose || 'Not specified.'}`,
			`Core values: ${s.coreValues || 'Not specified.'}`,
			`Voice and tone: ${s.voiceTone || 'Not specified.'}`,
		].join('\n');

		const { content, usage } = await this.makeClient().chat([
			{ role: 'system', content: SOUL_GENERATION_PROMPT },
			{ role: 'user', content: userMessage },
		], { temperature: 0.7 });
		return { body: content, usage };
	}

	private async generateUser(): Promise<{ body: string; usage: LLMUsage }> {
		const userMessage = [
			`Language: Write the entire document in ${this.language}.`,
			'',
			`Work style: ${this.workStyle || 'Not provided.'}`,
			`Communication preferences: ${this.commPreferences || 'Not provided.'}`,
			`Current areas of focus: ${this.interests || 'Not provided.'}`,
			`Long-term goals: ${this.longTermGoals || 'Not provided.'}`,
			`Personal context: ${this.personalContext || 'Not provided.'}`,
			`Patterns to avoid: ${this.patternsToAvoid || 'Not provided.'}`,
		].join('\n');

		const { content, usage } = await this.makeClient().chat([
			{ role: 'system', content: USER_GENERATION_PROMPT },
			{ role: 'user', content: userMessage },
		], { temperature: 0.5 });
		return { body: content, usage };
	}

	private userFallback(): string {
		return [
			'## Work style', '', this.workStyle || 'To be defined.',
			'', '## Communication preferences', '', this.commPreferences || 'To be defined.',
			'', '## Long-term goals', '', this.longTermGoals || 'To be defined.',
			'', '## Current areas of focus', '', this.interests || 'To be defined.',
			'', '## Patterns to avoid', '', this.patternsToAvoid || 'To be defined.',
			'', '## Relevant personal context', '', this.personalContext || 'To be defined.',
		].join('\n');
	}

	// — Finish orchestration —

	private async runFinish(): Promise<void> {
		const s = this.soulFormState;
		const soulFormHasContent = !!(s.corePurpose.trim() || s.coreValues.trim() || s.voiceTone.trim());
		const userFormHasContent = !!(
			this.workStyle.trim() || this.commPreferences.trim() || this.interests.trim() ||
			this.longTermGoals.trim() || this.personalContext.trim() || this.patternsToAvoid.trim()
		);

		const pricingPromise = this.plugin.getModelPricing().catch(() => null);
		const L = this.language;

		this.updateLoadingStatus(t('wizard_loading_user', L));
		let userBody: string;
		let userUsage: LLMUsage | null = null;
		try {
			const result = userFormHasContent ? await this.generateUser() : null;
			userBody = result?.body ?? this.userFallback();
			userUsage = result?.usage ?? null;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(t('wizard_user_gen_failed', L, { msg }));
			userBody = this.userFallback();
		}

		this.updateLoadingStatus(t('wizard_loading_soul', L));
		let soulBody: string;
		let soulPhrases: string[] = [];
		let soulUsage: LLMUsage | null = null;
		try {
			const result = soulFormHasContent ? await this.generateSoul() : null;
			const rawBody = result?.body ?? SOUL_FALLBACK;
			const parsed = parseLoadingPhrases(rawBody);
			soulBody = parsed.cleanBody;
			soulPhrases = parsed.phrases;
			soulUsage = result?.usage ?? null;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(t('wizard_soul_gen_failed', L, { msg }));
			soulBody = SOUL_FALLBACK;
		}

		this.updateLoadingStatus(t('wizard_loading_files', L));

		const pricing = await Promise.race([
			pricingPromise,
			new Promise<null>(resolve => window.setTimeout(() => resolve(null), 3000)),
		]);

		if (pricing && (soulUsage || userUsage)) {
			let totalCost = 0;
			if (soulUsage) totalCost += calcCost(soulUsage.promptTokens, soulUsage.completionTokens, pricing.promptPerToken, pricing.completionPerToken);
			if (userUsage) totalCost += calcCost(userUsage.promptTokens, userUsage.completionTokens, pricing.promptPerToken, pricing.completionPerToken);
			this.generationCost = totalCost;
		}

		try {
			const soulId = SoulManager.nameToId(s.name || 'Agent');
			this.plugin.settings.apiKey = this.apiKey;
			this.plugin.settings.modelSlug = this.modelSlug || 'anthropic/claude-sonnet-4.6';
			this.plugin.settings.defaultSoul = soulId;
			await this.plugin.saveSettings();

			await initVault({
				soulFormState: s,
				soulBody,
				soulPhrases,
				userBody,
				selectedTags: this.selectedTags,
				apiKey: this.apiKey,
				modelSlug: this.modelSlug,
				language: this.language,
			}, this.vaultManager);

			this.finishState = 'done';
			this.render();
		} catch (e) {
			this.finishError = e instanceof Error ? e.message : String(e);
			this.finishState = 'error';
			this.render();
		}
	}
}
