import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import type MinimalAgentPlugin from '../main';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { LLMError, type ChatMessage, type SoulMeta } from '../types';
import { calcCost, countTokens, formatCost } from '../utils/tokens';
import { createMascotImg, type MascotState } from './mascot';
import { SoulGeneratorModal } from '../souls/SoulGeneratorModal';
import { t } from '../i18n';
import { LoadingScreen } from './LoadingScreen';
import { LOADING_PHRASES } from './loadingPhrases';

export const CHAT_VIEW_TYPE = 'agent-chat';

export class ChatView extends ItemView {
	private transcript: ChatMessage[] = [];
	private activeSoulId: string;
	private soulDisplayName = 'Agent';
	private soulsCache: SoulMeta[] = [];
	private headerNameEl!: HTMLElement;
	private idleTimer: number | null = null;
	private isProcessing = false;
	private finalizationInProgress = false;

	private chatEl!: HTMLElement;
	private finalizingEl!: HTMLElement;
	private finalizingScreen!: LoadingScreen;
	private messagesEl!: HTMLElement;
	private textareaEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private finalizeBtn!: HTMLButtonElement;
	private saveChatBtn!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private loadingEl: HTMLElement | null = null;
	private soulDropdownEl: HTMLElement | null = null;
	private setMascotState!: (state: MascotState) => void;
	private setMascotEmoji!: (emoji: string) => void;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: MinimalAgentPlugin,
	) {
		super(leaf);
		this.activeSoulId = plugin.settings.defaultSoul || 'default';
	}

	getViewType(): string { return CHAT_VIEW_TYPE; }
	getDisplayText(): string { return this.soulDisplayName; }
	getIcon(): string { return 'message-square'; }

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('agent-chat-container');

		// — Finalizing loading screen (hidden by default) —
		this.finalizingEl = root.createDiv({ cls: 'agent-finalizing' });
		this.finalizingEl.hide();
		const uiLang = this.plugin.settings.language;
		this.finalizingScreen = new LoadingScreen(
			this.finalizingEl,
			t('chat_saving_session', uiLang),
			t('chat_extracting_memories', uiLang),
		);

		// — Main chat wrapper —
		this.chatEl = root.createDiv({ cls: 'agent-chat-body' });

		// — Mascot header —
		const headerEl = this.chatEl.createDiv({ cls: 'agent-chat-header' });
		const { setState, setEmoji } = createMascotImg(headerEl, 'idle');
		this.setMascotState = setState;
		this.setMascotEmoji = setEmoji;
		this.headerNameEl = headerEl.createDiv({ cls: 'agent-chat-header-name', text: this.soulDisplayName });

		// Soul selector
		const soulWrapEl = headerEl.createDiv({ cls: 'agent-soul-selector-wrap' });
		const lang = this.plugin.settings.language;

		const switchSoulBtn = soulWrapEl.createEl('button', {
			text: '⇄',
			cls: 'agent-soul-switch-btn',
			attr: { title: t('chat_switch_soul_title', lang) },
		});
		switchSoulBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleSoulDropdown(switchSoulBtn);
		});

		const soulAddBtn = soulWrapEl.createEl('button', { text: '+', cls: 'agent-soul-add-btn', attr: { title: t('chat_create_soul_title', lang) } });
		soulAddBtn.addEventListener('click', () => {
			new SoulGeneratorModal(
				this.app,
				this.plugin.vaultManager,
				this.plugin.parser,
				this.plugin.settings.apiKey,
				this.plugin.settings.modelSlug,
				(id) => { void this.refreshSoulSelector(id); },
				lang,
			).open();
		});

		void this.refreshSoulSelector(null);

		this.statusEl = headerEl.createDiv({ cls: 'agent-chat-status' });

		this.messagesEl = this.chatEl.createDiv({ cls: 'agent-chat-messages' });

		const footerEl = this.chatEl.createDiv({ cls: 'agent-chat-footer' });

		const composerEl = footerEl.createDiv({ cls: 'agent-chat-composer' });
		this.textareaEl = composerEl.createEl('textarea', {
			cls: 'agent-chat-input',
			attr: { placeholder: t('chat_input_placeholder', lang), rows: '3' },
		});
		this.sendBtn = composerEl.createEl('button', { cls: 'mod-cta agent-chat-send' });
		this.sendBtn.createEl('span', { text: '↵', cls: 'agent-chat-send-icon' });
		this.sendBtn.createEl('span', { text: t('chat_send', lang), cls: 'agent-chat-send-label' });

		const actionsEl = footerEl.createDiv({ cls: 'agent-chat-actions' });
		this.finalizeBtn = actionsEl.createEl('button', {
			text: t('chat_finalize', lang),
			cls: 'agent-chat-finalize',
		});
		this.saveChatBtn = actionsEl.createEl('button', {
			text: t('chat_save', lang),
			cls: 'agent-chat-save',
		});

		this.sendBtn.addEventListener('click', () => { void this.handleSend(); });
		this.finalizeBtn.addEventListener('click', () => { void this.finalizeSession(); });
		this.saveChatBtn.addEventListener('click', () => { void this.saveChat(); });
		this.textareaEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				void this.handleSend();
			}
		});
	}

	async onClose(): Promise<void> {
		this.clearIdleTimer();
	}

	// — Soul selector —

	private async refreshSoulSelector(selectId: string | null): Promise<void> {
		const souls = await this.plugin.soulManager.listSouls();
		this.soulsCache = souls;
		if (souls.length === 0) return;

		const target = selectId ?? this.activeSoulId;
		const exists = souls.some(s => s.id === target);
		this.activeSoulId = exists ? target : (souls[0]?.id ?? 'default');

		const activeSoul = souls.find(s => s.id === this.activeSoulId);
		if (activeSoul) {
			this.soulDisplayName = activeSoul.name;
			this.headerNameEl.setText(activeSoul.name);
			this.setMascotEmoji(activeSoul.emoji);
		}
	}

	private toggleSoulDropdown(anchorEl: HTMLElement): void {
		if (this.soulDropdownEl) {
			this.soulDropdownEl.remove();
			this.soulDropdownEl = null;
			return;
		}
		if (this.soulsCache.length === 0) return;

		const dropdown = document.body.createDiv({ cls: 'agent-soul-dropdown' });
		this.soulDropdownEl = dropdown;

		for (const soul of this.soulsCache) {
			const item = dropdown.createDiv({
				cls: `agent-soul-dropdown-item${soul.id === this.activeSoulId ? ' is-active' : ''}`,
				text: `${soul.emoji} ${soul.name}`,
			});
			item.addEventListener('click', () => {
				this.activeSoulId = soul.id;
				this.soulDisplayName = soul.name;
				this.headerNameEl.setText(soul.name);
				this.setMascotEmoji(soul.emoji);
				dropdown.remove();
				this.soulDropdownEl = null;
			});
		}

		const rect = anchorEl.getBoundingClientRect();
		dropdown.style.top = `${rect.bottom + 4}px`;
		dropdown.style.left = `${rect.left}px`;

		const close = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node)) {
				dropdown.remove();
				this.soulDropdownEl = null;
				document.removeEventListener('click', close);
			}
		};
		setTimeout(() => document.addEventListener('click', close), 0);
	}

	// — Send flow —

	private async handleSend(): Promise<void> {
		const text = this.textareaEl.value.trim();
		if (!text || this.isProcessing) return;
		this.textareaEl.value = '';
		await this.sendMessage(text);
	}

	private async sendMessage(userText: string): Promise<void> {
		this.setProcessing(true);
		this.appendMessage('user', userText);
		this.transcript.push({ role: 'user', content: userText });
		this.showLoadingBubble();

		try {
			const result = await this.plugin.contextAssembler.assemble({
				tokenBudget: this.plugin.settings.contextTokenBudget,
				episodeDaysBack: this.plugin.settings.episodeDaysBack,
				minImportance: this.plugin.settings.minImportanceForContext,
				soulId: this.activeSoulId,
			});

			const language = this.plugin.settings.language;
			const systemPrompt = result.blocks
				.map(b => `<!-- ${b.filePath} -->\n${b.content}`)
				.join('\n\n---\n\n')
				+ `\n\n---\n\nAlways respond in ${language}.`;

			const messages: ChatMessage[] = [
				{ role: 'system', content: systemPrompt },
				...this.transcript,
			];

			const contextTokens = result.totalTokens;
			const transcriptTokens = this.transcript.reduce((s, m) => s + countTokens(m.content), 0);
			const dropped = result.droppedItems > 0 ? ` · ${result.droppedItems} items dropped` : '';
			this.statusEl.setText(`~${contextTokens + transcriptTokens} tokens${dropped}`);

			const activeSoul = this.soulsCache.find(s => s.id === this.activeSoulId);
			const modelSlug = activeSoul?.model_slug || this.plugin.settings.modelSlug;
			const client = new OpenRouterClient(
				this.plugin.settings.apiKey,
				modelSlug,
			);
			const { content: response, usage } = await client.chat(messages);

			this.removeLoadingBubble();
			this.transcript.push({ role: 'assistant', content: response });
			this.appendMessage('agent', response);

			await this.plugin.sessionManager.updateActiveMdFromTurn(response);
			this.resetIdleTimer();

			// Append cost estimate to status line once pricing resolves (usually cached)
			void this.plugin.getModelPricing().then(pricing => {
				if (!pricing) return;
				const cost = calcCost(usage.promptTokens, usage.completionTokens, pricing.promptPerToken, pricing.completionPerToken);
				const dropped = result.droppedItems > 0 ? ` · ${result.droppedItems} items dropped` : '';
				this.statusEl.setText(`~${contextTokens + transcriptTokens} tokens · ${formatCost(cost)}${dropped}`);
			});

		} catch (e) {
			this.removeLoadingBubble();
			const msg = e instanceof LLMError ? e.message : String(e);
			new Notice(t('chat_agent_error', this.plugin.settings.language, { msg }));
			this.transcript.pop(); // remove failed user turn
		} finally {
			this.setProcessing(false);
		}
	}

	// — DOM helpers —

	private appendMessage(role: 'user' | 'agent', content: string): void {
		const msgEl = this.messagesEl.createDiv({
			cls: `agent-message agent-message--${role}`,
		});
		const contentEl = msgEl.createDiv({ cls: 'agent-message-content' });

		if (role === 'agent') {
			void MarkdownRenderer.render(this.app, content, contentEl, '', this);
		} else {
			contentEl.setText(content);
		}

		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private setProcessing(value: boolean): void {
		this.isProcessing = value;
		this.sendBtn.disabled = value;
		this.textareaEl.disabled = value;
		this.finalizeBtn.disabled = value;
		this.saveChatBtn.disabled = value;
		this.setMascotState(value ? 'thinking' : (this.transcript.length > 0 ? 'blink' : 'idle'));
	}

	private showLoadingBubble(): void {
		this.loadingEl = this.messagesEl.createDiv({ cls: 'agent-message agent-message--agent' });
		const contentEl = this.loadingEl.createDiv({ cls: 'agent-message-content agent-message-loading' });
		contentEl.setText(t('chat_thinking', this.plugin.settings.language, { name: this.soulDisplayName }));
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private removeLoadingBubble(): void {
		if (this.loadingEl) {
			this.loadingEl.remove();
			this.loadingEl = null;
		}
	}

	// — Save conversation —

	private async saveChat(): Promise<void> {
		if (this.transcript.length === 0) return;

		const now = new Date();
		const date = now.toISOString().slice(0, 10);
		const timeParts = now.toISOString().slice(11, 16); // HH:MM
		const fileTime = timeParts.replace(':', '-');       // HH-MM (safe for filenames)
		const displayTime = timeParts;                      // HH:MM (for display)

		const lines: string[] = [
			`# Chat · ${date} ${displayTime}`,
			'',
		];

		for (const msg of this.transcript) {
			const speaker = msg.role === 'user' ? 'You' : this.soulDisplayName;
			lines.push(`**${speaker}**`, '', msg.content.trim(), '', '---', '');
		}

		// Remove the trailing separator
		while (lines.length > 0 && (lines[lines.length - 1] === '' || lines[lines.length - 1] === '---')) {
			lines.pop();
		}

		const path = `chats/${date} ${fileTime}.md`;
		await this.plugin.vaultManager.writeFile(path, lines.join('\n'));
		new Notice(t('chat_saved_notice', this.plugin.settings.language, { path }));
	}

	// — Session finalization —

	async finalizeSession(): Promise<void> {
		if (this.transcript.length === 0 || this.finalizationInProgress) return;
		this.finalizationInProgress = true;
		this.clearIdleTimer();

		const activeSoul = this.soulsCache.find(s => s.id === this.activeSoulId);
		if (activeSoul) this.finalizingScreen.setEmoji(activeSoul.emoji);
		const soulPhrases = activeSoul?.loading_phrases ?? [];
		if (soulPhrases.length > 0) this.finalizingScreen.startPhrases(soulPhrases);
		this.finalizingScreen.startStatusPhrases(LOADING_PHRASES);

		this.chatEl.hide();
		this.finalizingEl.show();

		try {
			await this.plugin.sessionManager.finalizeSession(this.transcript, this.activeSoulId, this.soulDisplayName);
			this.transcript = [];
			this.messagesEl.empty();
			this.statusEl.setText('');
			this.setMascotState('idle');
		} finally {
			this.finalizingScreen.stopPhrases();
			this.finalizingScreen.stopStatusPhrases();
			this.finalizationInProgress = false;
			this.finalizingEl.hide();
			this.chatEl.show();
		}
	}

	// — Idle timer —

	private resetIdleTimer(): void {
		this.clearIdleTimer();
		const minutes = this.plugin.settings.idleTimeoutMinutes;
		if (minutes <= 0) return;
		this.idleTimer = window.setTimeout(
			() => { void this.finalizeSession(); },
			minutes * 60 * 1000,
		);
	}

	private clearIdleTimer(): void {
		if (this.idleTimer !== null) {
			window.clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}
}
