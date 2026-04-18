import { App, PluginSettingTab, Setting } from 'obsidian';
import type MinimalAgentPlugin from './main';
import type { Importance } from './types';
import { CURATED_MODELS, CUSTOM_MODEL_OPTION, findCuratedModel } from './llm/curatedModels';
import { SoulGeneratorModal } from './souls/SoulGeneratorModal';
import { LANGUAGES, detectDefaultLanguage, t } from './i18n';

export interface AgentSettings {
	defaultSoul: string;
	apiKey: string;
	modelSlug: string;
	language: string;
	contextTokenBudget: number;
	episodeDaysBack: number;
	minImportanceForContext: Importance;
	requireConfirmBeforeWrite: boolean;
	traceRetentionDays: number;
	autoArchiveExpiredItems: boolean;
	idleTimeoutMinutes: number;
}

export const DEFAULT_SETTINGS: AgentSettings = {
	defaultSoul: 'default',
	apiKey: '',
	modelSlug: 'anthropic/claude-sonnet-4.6',
	language: detectDefaultLanguage(),
	contextTokenBudget: 8000,
	episodeDaysBack: 2,
	minImportanceForContext: 'medium',
	requireConfirmBeforeWrite: true,
	traceRetentionDays: 30,
	autoArchiveExpiredItems: true,
	idleTimeoutMinutes: 5,
};

export class AgentSettingTab extends PluginSettingTab {
	plugin: MinimalAgentPlugin;

	constructor(app: App, plugin: MinimalAgentPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const L = this.plugin.settings.language;

		const buildZdrDesc = (template: string): DocumentFragment => {
			const [before, after] = template.split('{zdr}');
			const frag = document.createDocumentFragment();
			frag.append(before ?? '');
			const link = document.createElement('a');
			link.textContent = 'ZDR ✓';
			link.className = 'agent-wizard-zdr-link';
			link.addEventListener('click', (e) => {
				e.preventDefault();
				window.open('https://openrouter.ai/docs/guides/features/zdr', '_blank');
			});
			frag.appendChild(link);
			frag.append(after ?? '');
			return frag;
		};

		// — Souls —
		containerEl.createEl('h3', { text: t('settings_souls_section', L) });

		// Soul selector — populated async
		let soulDropdown: HTMLSelectElement | null = null;

		const soulSetting = new Setting(containerEl)
			.setName(t('settings_default_soul_name', L))
			.setDesc(t('settings_default_soul_desc', L))
			.addDropdown(drop => {
				soulDropdown = drop.selectEl;
				drop.addOption(this.plugin.settings.defaultSoul, t('settings_souls_loading', L, { id: this.plugin.settings.defaultSoul }));
				drop.setValue(this.plugin.settings.defaultSoul);
				drop.onChange(async (value) => {
					this.plugin.settings.defaultSoul = value;
					await this.plugin.saveSettings();
				});
			})
			.addButton(btn => {
				btn.setButtonText(t('settings_create_soul_btn', L)).onClick(() => {
					new SoulGeneratorModal(
						this.app,
						this.plugin.vaultManager,
						this.plugin.parser,
						this.plugin.settings.apiKey,
						this.plugin.settings.modelSlug,
						(id) => {
							// Refresh the dropdown after creation
							void this.plugin.soulManager.listSouls().then(souls => {
								if (!soulDropdown) return;
								soulDropdown.empty();
								for (const s of souls) {
									const opt = soulDropdown.createEl('option', {
										text: `${s.emoji} ${s.name}`,
										value: s.id,
									});
									if (s.id === id) opt.selected = true;
								}
								this.plugin.settings.defaultSoul = id;
								void this.plugin.saveSettings();
							});
						},
						this.plugin.settings.language,
					).open();
				});
			});
		void soulSetting; // suppress unused warning

		// Async populate the soul dropdown
		void this.plugin.soulManager.listSouls().then(souls => {
			if (!soulDropdown) return;
			const currentValue = this.plugin.settings.defaultSoul;
			soulDropdown.empty();
			if (souls.length === 0) {
				soulDropdown.createEl('option', { text: t('settings_souls_none', L), value: '' });
				return;
			}
			for (const s of souls) {
				const opt = soulDropdown.createEl('option', {
					text: `${s.emoji} ${s.name}`,
					value: s.id,
				});
				if (s.id === currentValue) opt.selected = true;
			}
		});

		// — API —
		containerEl.createEl('h3', { text: t('settings_api_section', L) });

		new Setting(containerEl)
			.setName(t('settings_api_key_name', L))
			.setDesc(this.plugin.settings.apiKey
				? t('settings_api_key_configured', L)
				: t('settings_api_key_missing', L))
			.addText(text => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('sk-or-...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		// Model selector
		const isCustom = !findCuratedModel(this.plugin.settings.modelSlug);
		const dropdownValue = isCustom ? CUSTOM_MODEL_OPTION : this.plugin.settings.modelSlug;

		const modelInfoEl = containerEl.createDiv({ cls: 'agent-model-info' });

		const renderModelInfo = (slug: string) => {
			modelInfoEl.empty();
			const model = findCuratedModel(slug);
			if (!model) return;
			const priceEl = modelInfoEl.createDiv({ cls: 'agent-model-info__price' });
			priceEl.createSpan({ text: `Input: $${model.inputPricePerM.toFixed(2)} / 1M · Output: $${model.outputPricePerM.toFixed(2)} / 1M` });
			modelInfoEl.createDiv({ text: model.description, cls: 'agent-model-info__desc' });
		};

		// Custom slug field (shown only when "Custom…" is selected)
		const customFieldEl = containerEl.createDiv({ cls: 'agent-model-custom' });
		customFieldEl.style.display = isCustom ? '' : 'none';
		let customInput: HTMLInputElement;

		new Setting(containerEl)
			.setName(t('model', L))
			.setDesc(buildZdrDesc(t('settings_model_desc', L)))
			.addDropdown(drop => {
				for (const m of CURATED_MODELS) {
					drop.addOption(m.slug, `${m.displayName} (${m.provider})`);
				}
				drop.addOption(CUSTOM_MODEL_OPTION, 'Custom…');
				drop.setValue(dropdownValue);
				drop.onChange(async (value) => {
					if (value === CUSTOM_MODEL_OPTION) {
						customFieldEl.style.display = '';
						modelInfoEl.empty();
					} else {
						customFieldEl.style.display = 'none';
						this.plugin.settings.modelSlug = value;
						await this.plugin.saveSettings();
						renderModelInfo(value);
					}
				});
			});

		// Insert model info and custom field after the Setting row
		containerEl.appendChild(modelInfoEl);
		containerEl.appendChild(customFieldEl);

		new Setting(customFieldEl)
			.setName(t('custom_model_slug', L))
			.setDesc(t('settings_model_custom_desc', L))
			.addText(text => {
				customInput = text.inputEl;
				text
					.setPlaceholder(t('settings_model_custom_ph', L))
					.setValue(isCustom ? this.plugin.settings.modelSlug : '')
					.onChange(async (value) => {
						this.plugin.settings.modelSlug = value.trim();
						await this.plugin.saveSettings();
					});
			});

		if (!isCustom) renderModelInfo(this.plugin.settings.modelSlug);

		// — Language —
		containerEl.createEl('h3', { text: t('settings_language_section', L) });

		new Setting(containerEl)
			.setName(t('settings_language_name', L))
			.setDesc(t('settings_language_desc', L))
			.addDropdown(drop => {
				for (const lang of Object.keys(LANGUAGES)) {
					drop.addOption(lang, lang);
				}
				drop.setValue(this.plugin.settings.language);
				drop.onChange(async (value) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
				});
			});

		// — Context —
		containerEl.createEl('h3', { text: t('settings_context_section', L) });

		new Setting(containerEl)
			.setName(t('settings_token_budget_name', L))
			.setDesc(t('settings_token_budget_desc', L))
			.addText(text => text
				.setValue(String(this.plugin.settings.contextTokenBudget))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					if (!isNaN(parsed) && parsed > 0) {
						this.plugin.settings.contextTokenBudget = parsed;
						await this.plugin.saveSettings();
					}
				}));

		const ctxInfoEl = containerEl.createDiv({ cls: 'agent-ctx-info' });
		ctxInfoEl.createSpan({ text: t('settings_ctx_calculating', L), cls: 'agent-ctx-info__text' });

		void this.plugin.contextAssembler.assemble({
			tokenBudget: this.plugin.settings.contextTokenBudget,
			episodeDaysBack: this.plugin.settings.episodeDaysBack,
			minImportance: this.plugin.settings.minImportanceForContext,
			soulId: this.plugin.settings.defaultSoul || 'default',
		}).then(result => {
			const budget = this.plugin.settings.contextTokenBudget;
			const used = result.totalTokens;
			const pct = Math.round((used / budget) * 100);
			const droppedStr = result.droppedItems > 0
				? t('settings_ctx_dropped', L, { n: String(result.droppedItems), s: result.droppedItems !== 1 ? 's' : '' })
				: '';
			const label = t('settings_ctx_usage', L, {
				used: used.toLocaleString(),
				budget: budget.toLocaleString(),
				pct: String(pct),
				dropped: droppedStr,
			});

			ctxInfoEl.empty();
			const span = ctxInfoEl.createSpan({ text: label, cls: 'agent-ctx-info__text' });
			span.addClass(pct >= 100 ? 'agent-ctx-info--over' : pct >= 80 ? 'agent-ctx-info--warn' : 'agent-ctx-info--ok');
		}).catch(() => {
			ctxInfoEl.empty();
			ctxInfoEl.createSpan({ text: t('settings_ctx_error', L), cls: 'agent-ctx-info__text agent-ctx-info--muted' });
		});

		new Setting(containerEl)
			.setName(t('settings_episode_days_name', L))
			.setDesc(t('settings_episode_days_desc', L))
			.addText(text => text
				.setValue(String(this.plugin.settings.episodeDaysBack))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					if (!isNaN(parsed) && parsed >= 0) {
						this.plugin.settings.episodeDaysBack = parsed;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName(t('settings_min_importance_name', L))
			.setDesc(t('settings_min_importance_desc', L))
			.addDropdown(drop => drop
				.addOption('low', t('settings_importance_low', L))
				.addOption('medium', t('settings_importance_medium', L))
				.addOption('high', t('settings_importance_high', L))
				.addOption('critical', t('settings_importance_critical', L))
				.setValue(this.plugin.settings.minImportanceForContext)
				.onChange(async (value) => {
					this.plugin.settings.minImportanceForContext = value as Importance;
					await this.plugin.saveSettings();
				}));

		// — Memory —
		containerEl.createEl('h3', { text: t('settings_memory_section', L) });

		new Setting(containerEl)
			.setName(t('settings_require_confirm_name', L))
			.setDesc(t('settings_require_confirm_desc', L))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.requireConfirmBeforeWrite)
				.onChange(async (value) => {
					this.plugin.settings.requireConfirmBeforeWrite = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings_auto_archive_name', L))
			.setDesc(t('settings_auto_archive_desc', L))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoArchiveExpiredItems)
				.onChange(async (value) => {
					this.plugin.settings.autoArchiveExpiredItems = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings_trace_retention_name', L))
			.setDesc(t('settings_trace_retention_desc', L))
			.addText(text => text
				.setValue(String(this.plugin.settings.traceRetentionDays))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					if (!isNaN(parsed) && parsed > 0) {
						this.plugin.settings.traceRetentionDays = parsed;
						await this.plugin.saveSettings();
					}
				}));

		// — Session —
		containerEl.createEl('h3', { text: t('settings_session_section', L) });

		new Setting(containerEl)
			.setName(t('settings_idle_timeout_name', L))
			.setDesc(t('settings_idle_timeout_desc', L))
			.addText(text => text
				.setValue(String(this.plugin.settings.idleTimeoutMinutes))
				.onChange(async (value) => {
					const parsed = parseInt(value, 10);
					if (!isNaN(parsed) && parsed >= 0) {
						this.plugin.settings.idleTimeoutMinutes = parsed;
						await this.plugin.saveSettings();
					}
				}));
	}
}
