import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import type MinimalAgentPlugin from '../main';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { LLMError, type ChatMessage } from '../types';
import { countTokens } from '../utils/tokens';

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
	private statusEl!: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: MinimalAgentPlugin,
	) {
		super(leaf);
	}

	getViewType(): string { return CHAT_VIEW_TYPE; }
	getDisplayText(): string { return 'Agent'; }
	getIcon(): string { return 'message-square'; }

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('agent-chat-container');

		this.messagesEl = root.createDiv({ cls: 'agent-chat-messages' });

		const footerEl = root.createDiv({ cls: 'agent-chat-footer' });

		const composerEl = footerEl.createDiv({ cls: 'agent-chat-composer' });
		this.textareaEl = composerEl.createEl('textarea', {
			cls: 'agent-chat-input',
			attr: { placeholder: 'Message… (Ctrl+Enter to send)', rows: '3' },
		});
		this.sendBtn = composerEl.createEl('button', {
			text: 'Send',
			cls: 'mod-cta agent-chat-send',
		});

		this.finalizeBtn = footerEl.createEl('button', {
			text: 'Finalize and memorize',
			cls: 'agent-chat-finalize',
		});

		this.statusEl = footerEl.createDiv({ cls: 'agent-chat-status' });

		this.sendBtn.addEventListener('click', () => { void this.handleSend(); });
		this.finalizeBtn.addEventListener('click', () => { void this.finalizeSession(); });
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
			const response = await client.chat(messages);

			this.transcript.push({ role: 'assistant', content: response });
			this.appendMessage('agent', response);

			await this.updateActiveMd(response);
			this.resetIdleTimer();

		} catch (e) {
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
		this.sendBtn.textContent = value ? '…' : 'Send';
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
		const updatedBody = this.plugin.parser.updateSection(body, 'Foco actual', summary);

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
