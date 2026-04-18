import type { App } from 'obsidian';

const LOCK_TOOLTIP = 'Protected file — cannot be renamed or deleted while Minimal Agent is active.';

export class LockIcons {
	private timer: number | null = null;
	private observer: MutationObserver | null = null;

	constructor(private app: App, private coreFiles: string[]) {}

	setup(): void {
		this.update();

		const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
		const containerEl = (fileExplorer?.view as { containerEl?: HTMLElement })?.containerEl;
		if (containerEl) {
			this.observer = new MutationObserver(() => {
				if (this.timer !== null) window.clearTimeout(this.timer);
				this.timer = window.setTimeout(() => {
					this.timer = null;
					this.update();
				}, 250);
			});
			this.observer.observe(containerEl, { childList: true, subtree: true });
		}
	}

	update(): void {
		for (const corePath of this.coreFiles) {
			const navEl = document.querySelector(`.nav-file-title[data-path="${corePath}"]`);
			if (!navEl || navEl.querySelector('.agent-lock-icon')) continue;
			const iconEl = document.createElement('span');
			iconEl.className = 'agent-lock-icon';
			iconEl.textContent = '🔒';
			iconEl.setAttribute('title', LOCK_TOOLTIP);
			navEl.insertBefore(iconEl, navEl.firstChild);
		}
	}

	destroy(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		document.querySelectorAll('.agent-lock-icon').forEach(el => el.remove());
	}
}
