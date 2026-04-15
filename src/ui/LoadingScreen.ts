import { createMascotImg } from './mascot';

/**
 * Reusable loading screen component.
 * Renders: mascot (thinking) + h2 title + italic status line.
 * Used in: ChatView finalizing overlay, SetupWizard step 6, SoulGeneratorModal generating state.
 *
 * Title (h2)   → rotated with soul personality phrases via startPhrases()
 * Status line  → rotated with static phrases via startStatusPhrases(), or set manually via setStatus()
 */
export class LoadingScreen {
	private titleEl: HTMLElement;
	private statusEl: HTMLElement;
	private titleInterval: number | null = null;
	private statusInterval: number | null = null;
	private setMascotEmoji: (emoji: string) => void;

	constructor(container: HTMLElement, title: string, initialStatus: string) {
		const mascotWrapper = container.createDiv({ cls: 'agent-wizard-mascot' });
		const { setEmoji } = createMascotImg(mascotWrapper, 'thinking', 'agent-wizard-mascot-img');
		this.setMascotEmoji = setEmoji;
		this.titleEl = container.createEl('h2', { text: title });
		this.statusEl = container.createEl('p', {
			text: initialStatus,
			cls: 'agent-wizard-loading-status',
		});
	}

	/** Set the status line text directly (stops any running status phrase rotation). */
	setStatus(text: string): void {
		this.stopStatusPhrases();
		this.statusEl.setText(text);
	}

	/** Rotate soul personality phrases in the title every 2.5 s. */
	startPhrases(phrases: string[]): void {
		this.stopPhrases();
		if (phrases.length === 0) return;
		let i = 0;
		this.titleEl.setText(phrases[i] ?? '');
		this.titleInterval = window.setInterval(() => {
			i = (i + 1) % phrases.length;
			this.titleEl.setText(phrases[i] ?? '');
		}, 4000);
	}

	/** Stop rotating title phrases. */
	stopPhrases(): void {
		if (this.titleInterval !== null) {
			window.clearInterval(this.titleInterval);
			this.titleInterval = null;
		}
	}

	/** Rotate static phrases in the status line every 4 s. */
	startStatusPhrases(phrases: string[]): void {
		this.stopStatusPhrases();
		if (phrases.length === 0) return;
		// Start at a random offset so repeated sessions feel fresh
		let i = Math.floor(Math.random() * phrases.length);
		this.statusEl.setText(phrases[i] ?? '');
		this.statusInterval = window.setInterval(() => {
			i = (i + 1) % phrases.length;
			this.statusEl.setText(phrases[i] ?? '');
		}, 7000);
	}

	/** Stop rotating status phrases. */
	stopStatusPhrases(): void {
		if (this.statusInterval !== null) {
			window.clearInterval(this.statusInterval);
			this.statusInterval = null;
		}
	}

	/** Update the mascot to show the given soul emoji (animated PNG). */
	setEmoji(emoji: string): void {
		this.setMascotEmoji(emoji);
	}
}
