import { App, PluginSettingTab, Setting } from 'obsidian';
import type MinimalAgentPlugin from './main';
import type { Importance } from './types';

export interface AgentSettings {
	agentName: string;
	apiKey: string;
	modelSlug: string;
	contextTokenBudget: number;
	episodeDaysBack: number;
	minImportanceForContext: Importance;
	requireConfirmBeforeWrite: boolean;
	traceRetentionDays: number;
	autoArchiveExpiredItems: boolean;
	idleTimeoutMinutes: number;
}

export const DEFAULT_SETTINGS: AgentSettings = {
	agentName: 'Agent',
	apiKey: '',
	modelSlug: 'qwen/qwen3.5-27b',
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

		// — Agent —
		containerEl.createEl('h3', { text: 'Agent' });

		new Setting(containerEl)
			.setName('Agent name')
			.setDesc('Name displayed in the chat panel and loading indicator.')
			.addText(text => text
				.setPlaceholder('Agent')
				.setValue(this.plugin.settings.agentName)
				.onChange(async (value) => {
					this.plugin.settings.agentName = value.trim() || 'Agent';
					await this.plugin.saveSettings();
				}));

		// — API —
		containerEl.createEl('h3', { text: 'API' });

		new Setting(containerEl)
			.setName('API key')
			.setDesc(this.plugin.settings.apiKey
				? 'API key configured.'
				: 'No API key set — the agent will not work until you add one.')
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

		new Setting(containerEl)
			.setName('Model')
			.setDesc('OpenRouter model slug (e.g. qwen/qwen3.5-27b, anthropic/claude-sonnet-4-5).')
			.addText(text => text
				.setPlaceholder('qwen/qwen3.5-27b')
				.setValue(this.plugin.settings.modelSlug)
				.onChange(async (value) => {
					this.plugin.settings.modelSlug = value.trim();
					await this.plugin.saveSettings();
				}));

		// — Context —
		containerEl.createEl('h3', { text: 'Context' });

		new Setting(containerEl)
			.setName('Token budget')
			.setDesc('Maximum tokens to use for context assembly per session.')
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
		ctxInfoEl.createSpan({ text: 'Calculating context usage…', cls: 'agent-ctx-info__text' });

		void this.plugin.contextAssembler.assemble({
			tokenBudget: this.plugin.settings.contextTokenBudget,
			episodeDaysBack: this.plugin.settings.episodeDaysBack,
			minImportance: this.plugin.settings.minImportanceForContext,
		}).then(result => {
			const budget = this.plugin.settings.contextTokenBudget;
			const used = result.totalTokens;
			const pct = Math.round((used / budget) * 100);
			const dropped = result.droppedItems > 0
				? ` · ${result.droppedItems} item${result.droppedItems !== 1 ? 's' : ''} dropped`
				: '';
			const label = `Context usage: ~${used.toLocaleString()} / ${budget.toLocaleString()} tokens (${pct}%)${dropped}`;

			ctxInfoEl.empty();
			const span = ctxInfoEl.createSpan({ text: label, cls: 'agent-ctx-info__text' });
			span.addClass(pct >= 100 ? 'agent-ctx-info--over' : pct >= 80 ? 'agent-ctx-info--warn' : 'agent-ctx-info--ok');
		}).catch(() => {
			ctxInfoEl.empty();
			ctxInfoEl.createSpan({ text: 'Could not calculate context — run the setup wizard first.', cls: 'agent-ctx-info__text agent-ctx-info--muted' });
		});

		new Setting(containerEl)
			.setName('Episode history (days)')
			.setDesc('How many days of past episodes to load into context.')
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
			.setName('Minimum importance for context')
			.setDesc('Memory items below this importance level are excluded from context.')
			.addDropdown(drop => drop
				.addOption('low', 'Low')
				.addOption('medium', 'Medium')
				.addOption('high', 'High')
				.addOption('critical', 'Critical')
				.setValue(this.plugin.settings.minImportanceForContext)
				.onChange(async (value) => {
					this.plugin.settings.minImportanceForContext = value as Importance;
					await this.plugin.saveSettings();
				}));

		// — Memory —
		containerEl.createEl('h3', { text: 'Memory' });

		new Setting(containerEl)
			.setName('Require confirmation before writing')
			.setDesc('When enabled, memory candidates are written to _pending/ for manual review before being confirmed.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.requireConfirmBeforeWrite)
				.onChange(async (value) => {
					this.plugin.settings.requireConfirmBeforeWrite = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-archive expired items')
			.setDesc('Automatically mark memory items as stale when their expiry date passes.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoArchiveExpiredItems)
				.onChange(async (value) => {
					this.plugin.settings.autoArchiveExpiredItems = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Trace retention (days)')
			.setDesc('Raw API traces older than this are deleted automatically on load.')
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
		containerEl.createEl('h3', { text: 'Session' });

		new Setting(containerEl)
			.setName('Idle timeout (minutes)')
			.setDesc('Minutes of inactivity before the session is automatically finalized and memory is extracted. Set to 0 to disable.')
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
