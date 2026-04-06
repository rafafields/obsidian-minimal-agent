import { Notice, Plugin, TFile } from 'obsidian';
import { AgentSettings, AgentSettingTab, DEFAULT_SETTINGS } from './settings';
import { ChatView, CHAT_VIEW_TYPE } from './ui/ChatView';
import { VaultManager } from './vault/VaultManager';
import { FrontmatterParser } from './vault/FrontmatterParser';
import { TaxonomyManager } from './vault/TaxonomyManager';
import { MemoryManager } from './memory/MemoryManager';
import { ContextAssembler } from './context/ContextAssembler';
import { SessionManager } from './session/SessionManager';
import { SetupWizard } from './wizard/SetupWizard';
import type { MemoryItemFrontmatter } from './types';

const CORE_FILES = [
	'_agent/soul.md',
	'_agent/user.md',
	'_agent/taxonomy.md',
	'_agent/memory/active.md',
];

export default class MinimalAgentPlugin extends Plugin {
	settings: AgentSettings;
	vaultManager: VaultManager;
	parser: FrontmatterParser;
	taxonomyManager: TaxonomyManager;
	memoryManager: MemoryManager;
	contextAssembler: ContextAssembler;
	sessionManager: SessionManager;

	private coreFileContents = new Map<string, string>();
	private lockIconTimer: number | null = null;
	private lockIconObserver: MutationObserver | null = null;

	async onload() {
		await this.loadSettings();

		this.vaultManager = new VaultManager(this.app);
		this.parser = new FrontmatterParser();
		this.taxonomyManager = new TaxonomyManager(this.vaultManager, this.parser);
		this.memoryManager = new MemoryManager(this.vaultManager, this.parser);
		this.contextAssembler = new ContextAssembler(this.vaultManager, this.parser, this.memoryManager);
		this.sessionManager = new SessionManager(
			this.vaultManager,
			this.parser,
			this.taxonomyManager,
			() => this.settings.apiKey,
			() => this.settings.modelSlug,
		);

		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

		this.addCommand({
			id: 'open-agent-chat',
			name: 'Open agent chat',
			callback: () => this.openChatView(),
		});

		this.addRibbonIcon('message-square', 'Open agent chat', () => this.openChatView());

		this.addSettingTab(new AgentSettingTab(this.app, this));

		this.registerVaultHooks();

		this.app.workspace.onLayoutReady(() => {
			if (SetupWizard.isFirstRun(this.app)) {
				new SetupWizard(this.app, this, this.vaultManager).open();
			}
			void this.memoryManager.autoMarkStale();
			void this.cleanupTraces();
			void this.cacheCoreFiles();
			this.setupLockIcons();
		});
	}

	onunload() {
		if (this.lockIconTimer !== null) window.clearTimeout(this.lockIconTimer);
		if (this.lockIconObserver) {
			this.lockIconObserver.disconnect();
			this.lockIconObserver = null;
		}
		// Remove injected lock icons so they don't linger after plugin disable
		document.querySelectorAll('.agent-lock-icon').forEach(el => el.remove());
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<AgentSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	openChatView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	// — Vault hooks —

	private registerVaultHooks() {
		// Rename: protect core files + confirm candidates moved out of _pending/
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFile)) return;

				// Core file protection: rename it back
				if (CORE_FILES.includes(oldPath)) {
					void this.app.vault.rename(file, oldPath);
					new Notice(`"${oldPath.split('/').pop()}" is a protected file and cannot be renamed.`);
					return;
				}

				// Candidate confirmed: user moved file out of _pending/
				if (!oldPath.includes('memory/items/_pending/')) return;

				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter as Partial<MemoryItemFrontmatter> | undefined;
				if (!fm) return;

				this.memoryManager.confirmItem(file.path, fm as MemoryItemFrontmatter);

				const proposedTags = fm.proposed_tags;
				if (Array.isArray(proposedTags) && proposedTags.length > 0) {
					void this.taxonomyManager.addToActive(proposedTags);
				}
			}),
		);

		// Delete: protect core files + record candidate discards
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				// Core file protection: restore from cache
				if (CORE_FILES.includes(file.path)) {
					const cached = this.coreFileContents.get(file.path);
					if (cached) {
						void this.vaultManager.writeFile(file.path, cached);
						new Notice(`"${file.path.split('/').pop()}" is protected and has been restored.`);
					} else {
						new Notice(`"${file.path.split('/').pop()}" is protected. Re-run the setup wizard to restore it.`);
					}
					return;
				}

				// Candidate discarded: user deleted file from _pending/
				if (!file.path.includes('memory/items/_pending/')) return;
				const ts = new Date().toISOString().slice(0, 16).replace(':', '-');
				const tracePath = `_system/traces/${ts}-discard.md`;
				void this.vaultManager.writeFile(tracePath, `Discarded: ${file.path}\n`);
			}),
		);

		// Modify: update core file cache + invalidate memory score cache
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!(file instanceof TFile)) return;

				// Update cache when core files are edited
				if (CORE_FILES.includes(file.path)) {
					void this.vaultManager.readFile(file.path).then(content => {
						if (content !== null) this.coreFileContents.set(file.path, content);
					});
					return;
				}

				// Confirmed item edited: invalidate score cache
				if (!file.path.includes('memory/items/')) return;
				if (file.path.includes('_pending/')) return;
				this.memoryManager.reindex(file.path);
			}),
		);
	}

	// — Core file protection —

	private async cacheCoreFiles(): Promise<void> {
		for (const path of CORE_FILES) {
			const content = await this.vaultManager.readFile(path);
			if (content !== null) this.coreFileContents.set(path, content);
		}
	}

	// — File explorer lock icons —

	private setupLockIcons(): void {
		this.updateLockIcons();

		const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
		const containerEl = (fileExplorer?.view as { containerEl?: HTMLElement })?.containerEl;
		if (containerEl) {
			this.lockIconObserver = new MutationObserver(() => {
				if (this.lockIconTimer !== null) window.clearTimeout(this.lockIconTimer);
				this.lockIconTimer = window.setTimeout(() => {
					this.lockIconTimer = null;
					this.updateLockIcons();
				}, 250);
			});
			this.lockIconObserver.observe(containerEl, { childList: true, subtree: true });
		}
	}

	private updateLockIcons(): void {
		const tooltip = 'Protected file — cannot be renamed or deleted while Minimal Agent is active.';
		for (const corePath of CORE_FILES) {
			const navEl = document.querySelector(`.nav-file-title[data-path="${corePath}"]`);
			if (!navEl || navEl.querySelector('.agent-lock-icon')) continue;
			const iconEl = document.createElement('span');
			iconEl.className = 'agent-lock-icon';
			iconEl.textContent = '🔒';
			iconEl.setAttribute('title', tooltip);
			navEl.insertBefore(iconEl, navEl.firstChild);
		}
	}

	// — Trace retention cleanup —

	private async cleanupTraces(): Promise<void> {
		const files = this.vaultManager.listFiles('_system/traces');
		const cutoff = Date.now() - this.settings.traceRetentionDays * 24 * 60 * 60 * 1000;

		for (const filePath of files) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) continue;
			if (file.stat.mtime < cutoff) {
				await this.app.vault.delete(file);
			}
		}
	}
}
