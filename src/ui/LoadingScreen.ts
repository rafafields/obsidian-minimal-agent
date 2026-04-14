import { createMascotImg } from './mascot';

/**
 * Reusable loading screen component.
 * Renders: mascot (thinking) + h2 title + italic status line.
 * Used in: ChatView finalizing overlay, SetupWizard step 6, SoulGeneratorModal generating state.
 */
export class LoadingScreen {
	private statusEl: HTMLElement;

	constructor(container: HTMLElement, title: string, initialStatus: string) {
		const mascotWrapper = container.createDiv({ cls: 'agent-wizard-mascot' });
		createMascotImg(mascotWrapper, 'thinking', 'agent-wizard-mascot-img');
		container.createEl('h2', { text: title });
		this.statusEl = container.createEl('p', {
			text: initialStatus,
			cls: 'agent-wizard-loading-status',
		});
	}

	setStatus(text: string): void {
		this.statusEl.setText(text);
	}
}
