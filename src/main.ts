import { Plugin, TFile } from 'obsidian';
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

export default class MinimalAgentPlugin extends Plugin {
	settings: AgentSettings;
	vaultManager: VaultManager;
	parser: FrontmatterParser;
	taxonomyManager: TaxonomyManager;
	memoryManager: MemoryManager;
	contextAssembler: ContextAssembler;
	sessionManager: SessionManager;

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
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<AgentSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private openChatView() {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	// — Vault hooks —

	private registerVaultHooks() {
		// Candidate confirmed: user moved file out of _pending/
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!oldPath.includes('memory/items/_pending/')) return;
				if (!(file instanceof TFile)) return;

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

		// Candidate discarded: user deleted file from _pending/
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (!file.path.includes('memory/items/_pending/')) return;
				const ts = new Date().toISOString().slice(0, 16).replace(':', '-');
				const tracePath = `_system/traces/${ts}-discard.md`;
				void this.vaultManager.writeFile(tracePath, `Discarded: ${file.path}\n`);
			}),
		);

		// Confirmed item edited: invalidate score cache
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!(file instanceof TFile)) return;
				if (!file.path.includes('memory/items/')) return;
				if (file.path.includes('_pending/')) return;
				this.memoryManager.reindex(file.path);
			}),
		);
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
