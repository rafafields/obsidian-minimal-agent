import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import type MinimalAgentPlugin from '../main';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { LLMError, type ChatMessage } from '../types';
import { calcCost, countTokens, formatCost } from '../utils/tokens';
import { createMascotImg, type MascotState } from './mascot';

export const CHAT_VIEW_TYPE = 'agent-chat';

export class ChatView extends ItemView {
	private transcript: ChatMessage[] = [];
	private idleTimer: number | null = null;
	private isProcessing = false;
	private finalizationInProgress = false;

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
	}

	getViewType(): string { return CHAT_VIEW_TYPE; }
	getDisplayText(): string { return this.plugin.settings.agentName || 'Agent'; }
	getIcon(): string { return 'message-square'; }

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('agent-chat-container');

		// — Mascot header —
		const headerEl = root.createDiv({ cls: 'agent-chat-header' });
		const { setState } = createMascotImg(headerEl, 'idle');
		this.setMascotState = setState;
		headerEl.createDiv({
			cls: 'agent-chat-header-name',
			text: this.plugin.settings.agentName || 'Agent',
		});
		this.statusEl = headerEl.createDiv({ cls: 'agent-chat-status' });

		this.messagesEl = root.createDiv({ cls: 'agent-chat-messages' });

		const footerEl = root.createDiv({ cls: 'agent-chat-footer' });

		const composerEl = footerEl.createDiv({ cls: 'agent-chat-composer' });
		this.textareaEl = composerEl.createEl('textarea', {
			cls: 'agent-chat-input',
			attr: { placeholder: 'Message… (Ctrl+Enter to send)', rows: '3' },
		});
		this.sendBtn = composerEl.createEl('button', { cls: 'mod-cta agent-chat-send' });
		this.sendBtn.createEl('span', { text: '↵', cls: 'agent-chat-send-icon' });
		this.sendBtn.createEl('span', { text: 'Send', cls: 'agent-chat-send-label' });

		const actionsEl = footerEl.createDiv({ cls: 'agent-chat-actions' });
		this.finalizeBtn = actionsEl.createEl('button', {
			text: 'Finalize and memorize',
			cls: 'agent-chat-finalize',
		});
		this.saveChatBtn = actionsEl.createEl('button', {
			text: 'Save conversation',
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
			});

			const systemPrompt = result.blocks
				.map(b => `<!-- ${b.filePath} -->\n${b.content}`)
				.join('\n\n---\n\n');

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
			new Notice(`Agent error: ${msg}`);
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
		const agentName = this.plugin.settings.agentName || 'Agent';
		this.loadingEl = this.messagesEl.createDiv({ cls: 'agent-message agent-message--agent' });
		const contentEl = this.loadingEl.createDiv({ cls: 'agent-message-content agent-message-loading' });
		contentEl.setText(`${agentName} is thinking…`);
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

		const agentName = this.plugin.settings.agentName || 'Agent';
		const lines: string[] = [
			`# Chat · ${date} ${displayTime}`,
			'',
		];

		for (const msg of this.transcript) {
			const speaker = msg.role === 'user' ? 'You' : agentName;
			lines.push(`**${speaker}**`, '', msg.content.trim(), '', '---', '');
		}

		// Remove the trailing separator
		while (lines.length > 0 && (lines[lines.length - 1] === '' || lines[lines.length - 1] === '---')) {
			lines.pop();
		}

		const path = `chats/${date} ${fileTime}.md`;
		await this.plugin.vaultManager.writeFile(path, lines.join('\n'));
		new Notice(`Conversation saved to ${path}`);
	}

	// — Session finalization —

	async finalizeSession(): Promise<void> {
		if (this.transcript.length === 0 || this.finalizationInProgress) return;
		this.finalizationInProgress = true;
		this.clearIdleTimer();
		this.setProcessing(true);

		try {
			await this.plugin.sessionManager.finalizeSession(this.transcript);
			this.transcript = [];
			this.messagesEl.empty();
			this.statusEl.setText('');
			this.setMascotState('idle');
		} finally {
			this.finalizationInProgress = false;
			this.setProcessing(false);
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
