import { Setting } from 'obsidian';
import { EmojiPicker } from './EmojiPicker';
import { CURATED_MODELS, CUSTOM_MODEL_OPTION, findCuratedModel } from '../llm/curatedModels';
import { t } from '../utils/language';

export interface SoulFormState {
	name: string;
	emoji: string;
	corePurpose: string;
	coreValues: string;
	voiceTone: string;
	soulModelSlug: string;
}

export interface SoulFormNameConfig {
	name: string;
	desc: string;
	placeholder: string;
}

/**
 * Renders the shared soul identity fields (name, emoji, purpose, values, tone, model override)
 * into a given container. Mutations are written directly into `state`.
 */
export class SoulForm {
	constructor(
		private container: HTMLElement,
		private state: SoulFormState,
		private language: string,
		private nameConfig: SoulFormNameConfig,
	) {}

	render(): void {
		const { container: el, state, language: L } = this;

		new Setting(el)
			.setName(this.nameConfig.name)
			.setDesc(this.nameConfig.desc)
			.addText(text => text
				.setPlaceholder(this.nameConfig.placeholder)
				.setValue(state.name)
				.onChange(v => { state.name = v.trim(); }));

		const emojiSetting = new Setting(el)
			.setName(t('soul_emoji', L))
			.setDesc(t('soul_emoji_desc', L));
		new EmojiPicker(emojiSetting.controlEl, state.emoji, (v) => { state.emoji = v; });

		new Setting(el)
			.setName(t('core_purpose', L))
			.setDesc(t('core_purpose_desc', L))
			.addTextArea(ta => {
				ta.setValue(state.corePurpose)
					.setPlaceholder(t('core_purpose_placeholder', L))
					.onChange(v => { state.corePurpose = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(el)
			.setName(t('core_values', L))
			.setDesc(t('core_values_desc', L))
			.addTextArea(ta => {
				ta.setValue(state.coreValues)
					.setPlaceholder(t('core_values_placeholder', L))
					.onChange(v => { state.coreValues = v; });
				ta.inputEl.rows = 3;
			});

		new Setting(el)
			.setName(t('voice_tone', L))
			.setDesc(t('voice_tone_desc', L))
			.addTextArea(ta => {
				ta.setValue(state.voiceTone)
					.setPlaceholder(t('voice_tone_placeholder', L))
					.onChange(v => { state.voiceTone = v; });
				ta.inputEl.rows = 3;
			});

		this.renderModelOverride(el, state, L);
	}

	private renderModelOverride(el: HTMLElement, state: SoulFormState, L: string): void {
		const isCustomModel = !!state.soulModelSlug && !findCuratedModel(state.soulModelSlug);
		const modelSettingEl = el.createDiv();
		const modelSetting = new Setting(modelSettingEl)
			.setName(t('model', L))
			.setDesc(t('soul_model_desc', L));
		const modelSelectEl = modelSetting.controlEl.createEl('select', { cls: 'dropdown' });
		modelSelectEl.createEl('option', { text: t('soul_model_global', L), value: '' });
		for (const m of CURATED_MODELS) {
			modelSelectEl.createEl('option', { text: `${m.displayName} (${m.provider})`, value: m.slug });
		}
		modelSelectEl.createEl('option', { text: 'Custom…', value: CUSTOM_MODEL_OPTION });
		modelSelectEl.value = isCustomModel ? CUSTOM_MODEL_OPTION : (state.soulModelSlug || '');

		const customModelEl = modelSettingEl.createDiv({ cls: 'agent-wizard-field' });
		customModelEl.style.display = isCustomModel ? '' : 'none';
		customModelEl.createEl('label', { text: t('custom_model_slug', L), cls: 'agent-wizard-field__label' });
		const customModelInput = customModelEl.createEl('input', {
			cls: 'agent-wizard-field__input',
			attr: { type: 'text', placeholder: 'provider/model-name' },
		});
		customModelInput.value = isCustomModel ? state.soulModelSlug : '';
		customModelInput.addEventListener('input', () => { state.soulModelSlug = customModelInput.value.trim(); });

		modelSelectEl.addEventListener('change', () => {
			const v = modelSelectEl.value;
			if (v === CUSTOM_MODEL_OPTION) {
				customModelEl.style.display = '';
				state.soulModelSlug = customModelInput.value.trim();
			} else {
				customModelEl.style.display = 'none';
				state.soulModelSlug = v;
			}
		});
	}
}
