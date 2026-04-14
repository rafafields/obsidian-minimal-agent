import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import type MinimalAgentPlugin from '../main';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { LLMError, type ChatMessage, type SoulMeta } from '../types';
import { calcCost, countTokens, formatCost } from '../utils/tokens';
import { createMascotImg, type MascotState } from './mascot';
import { SoulGeneratorModal } from '../souls/SoulGeneratorModal';
import { t } from '../utils/language';
import { LoadingScreen } from './LoadingScreen';

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
	private setMascotState!: (state: MascotState) => void;

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
		const { setState } = createMascotImg(headerEl, 'idle');
		this.setMascotState = setState;
		this.headerNameEl = headerEl.createDiv({ cls: 'agent-chat-header-name', text: this.soulDisplayName });

		// Soul selector
		const soulWrapEl = headerEl.createDiv({ cls: 'agent-soul-selector-wrap' });
		const soulSelectEl = soulWrapEl.createEl('select', { cls: 'agent-soul-selector' });
		soulSelectEl.createEl('option', { text: `✨ ${this.activeSoulId}`, value: this.activeSoulId });
		soulSelectEl.addEventListener('change', () => {
			this.activeSoulId = soulSelectEl.value;
			const soul = this.soulsCache.find(s => s.id === this.activeSoulId);
			if (soul) {
				this.soulDisplayName = soul.name;
				this.headerNameEl.setText(soul.name);
				}
		});

		const soulAddBtn = soulWrapEl.createEl('button', { text: '+', cls: 'agent-soul-add-btn', attr: { title: t('chat_create_soul_title', this.plugin.settings.language) } });
		soulAddBtn.addEventListener('click', () => {
			new SoulGeneratorModal(
				this.app,
				this.plugin.vaultManager,
				this.plugin.parser,
				this.plugin.settings.apiKey,
				this.plugin.settings.modelSlug,
				(id) => { void this.refreshSoulSelector(soulSelectEl, id); },
				this.plugin.settings.language,
			).open();
		});

		void this.refreshSoulSelector(soulSelectEl, null);

		this.statusEl = headerEl.createDiv({ cls: 'agent-chat-status' });

		this.messagesEl = this.chatEl.createDiv({ cls: 'agent-chat-messages' });

		const footerEl = this.chatEl.createDiv({ cls: 'agent-chat-footer' });

		const composerEl = footerEl.createDiv({ cls: 'agent-chat-composer' });
		const lang = this.plugin.settings.language;
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

	private async refreshSoulSelector(selectEl: HTMLSelectElement, selectId: string | null): Promise<void> {
		const souls = await this.plugin.soulManager.listSouls();
		this.soulsCache = souls;
		selectEl.empty();
		if (souls.length === 0) {
			selectEl.createEl('option', { text: '✨ Agent', value: 'default' });
			return;
		}
		for (const s of souls) {
			selectEl.createEl('option', { text: `${s.emoji} ${s.name}`, value: s.id });
		}
		const target = selectId ?? this.activeSoulId;
		const exists = souls.some(s => s.id === target);
		selectEl.value = exists ? target : (souls[0]?.id ?? 'default');
		this.activeSoulId = selectEl.value;

		const activeSoul = souls.find(s => s.id === this.activeSoulId);
		if (activeSoul) {
			this.soulDisplayName = activeSoul.name;
			this.headerNameEl.setText(activeSoul.name);
		}
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

			const client = new OpenRouterClient(
				this.plugin.settings.apiKey,
				this.plugin.settings.modelSlug,
			);
			const { content: response, usage } = await client.chat(messages);

			this.removeLoadingBubble();
			this.transcript.push({ role: 'assistant', content: response });
			this.appendMessage('agent', response);

			await this.updateActiveMd(response);
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

	// — active.md update —

	private async updateActiveMd(lastResponse: string): Promise<void> {
		const path = '_agent/memory/active.md';
		const content = await this.plugin.vaultManager.readFile(path);
		if (!content) return;

		const summary = this.extractSummary(lastResponse, 3);
		const now = new Date().toISOString().slice(0, 16);

		const { frontmatter, body } = this.plugin.parser.parse(content);
		const updatedFm = { ...frontmatter, updated_at: now };
		const updatedBody = this.plugin.parser.updateSection(body, 'Current focus', summary);

		await this.plugin.vaultManager.writeFile(
			path,
			this.plugin.parser.serialize(updatedFm, updatedBody),
		);
	}

	private extractSummary(text: string, maxSentences: number): string {
		const trimmed = text.trim();
		const sentenceEndRe = /[.!?]/g;
		let match: RegExpExecArray | null;
		let count = 0;
		let endIdx = trimmed.length;
		while ((match = sentenceEndRe.exec(trimmed)) !== null) {
			count++;
			if (count === maxSentences) {
				endIdx = match.index + 1;
				break;
			}
		}
		return trimmed.slice(0, endIdx);
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

		this.chatEl.hide();
		this.finalizingEl.show();

		try {
			await this.plugin.sessionManager.finalizeSession(this.transcript, this.activeSoulId, this.soulDisplayName);
			this.transcript = [];
			this.messagesEl.empty();
			this.statusEl.setText('');
			this.setMascotState('idle');
		} finally {
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
