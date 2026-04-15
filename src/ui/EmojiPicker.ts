import { CURATED_EMOJIS } from '../emojis';

export class EmojiPicker {
	private panel: HTMLElement | null = null;
	private readonly triggerBtn: HTMLButtonElement;
	private currentEmoji: string;

	constructor(
		container: HTMLElement,
		initialEmoji: string,
		private readonly onChange: (emoji: string) => void,
	) {
		this.currentEmoji = initialEmoji;

		const wrap = container.createDiv({ cls: 'agent-emoji-wrap' });

		this.triggerBtn = wrap.createEl('button', {
			cls: 'agent-emoji-trigger',
			attr: { type: 'button' },
		});
		this.triggerBtn.textContent = this.currentEmoji;

		this.triggerBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (this.panel) {
				this.closePanel();
			} else {
				this.openPanel(wrap);
			}
		});

		document.addEventListener('click', this.handleOutsideClick);
	}

	private readonly handleOutsideClick = (e: MouseEvent) => {
		if (!this.triggerBtn.isConnected) {
			document.removeEventListener('click', this.handleOutsideClick);
			this.panel?.remove();
			this.panel = null;
			return;
		}
		if (!this.panel) return;
		const target = e.target as Node;
		if (!this.panel.contains(target) && !this.triggerBtn.contains(target)) {
			this.closePanel();
		}
	};

	private openPanel(anchor: HTMLElement) {
		const panel = anchor.createDiv({ cls: 'agent-emoji-panel' });
		this.panel = panel;

		const grid = panel.createDiv({ cls: 'agent-emoji-grid' });
		for (const emoji of CURATED_EMOJIS) {
			const btn = grid.createEl('button', {
				cls: 'agent-emoji-btn',
				attr: { type: 'button', title: emoji },
			});
			btn.textContent = emoji;
			if (emoji === this.currentEmoji) btn.addClass('is-selected');
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.select(emoji);
			});
		}
	}

	private closePanel() {
		this.panel?.remove();
		this.panel = null;
	}

	private select(emoji: string) {
		this.currentEmoji = emoji;
		this.triggerBtn.textContent = emoji;
		this.onChange(emoji);
		this.closePanel();
	}
}
