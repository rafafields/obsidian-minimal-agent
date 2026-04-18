import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { countTokens } from './utils/tokens';
import { AgentSettings, AgentSettingTab, DEFAULT_SETTINGS } from './settings';
import { OpenRouterClient } from './llm/OpenRouterClient';
import type { ModelPricing } from './types';
import { ChatView, CHAT_VIEW_TYPE } from './ui/ChatView';
import { VaultManager } from './vault/VaultManager';
import { FrontmatterParser } from './vault/FrontmatterParser';
import { TaxonomyManager } from './vault/TaxonomyManager';
import { MemoryManager } from './memory/MemoryManager';
import { ContextAssembler } from './context/ContextAssembler';
import { SessionManager } from './session/SessionManager';
import { SoulManager } from './souls/SoulManager';
import { SoulGeneratorModal } from './souls/SoulGeneratorModal';
import { SetupWizard } from './wizard/SetupWizard';
import { LockIcons } from './ui/LockIcons';
import type { MemoryItemFrontmatter } from './types';

const CORE_FILES = [
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
	soulManager: SoulManager;

	private coreFileContents = new Map<string, string>();
	private lockIcons: LockIcons;
	private statusBarTokenEl: HTMLElement;
	private statusBarTimer: number | null = null;
	private pricingCache = new Map<string, { pricing: ModelPricing; fetchedAt: number }>();
	private static readonly PRICING_TTL_MS = 60 * 60 * 1000; // 1 hour

	async onload() {
		await this.loadSettings();

		this.vaultManager = new VaultManager(this.app);
		this.parser = new FrontmatterParser();
		this.taxonomyManager = new TaxonomyManager(this.vaultManager, this.parser);
		this.memoryManager = new MemoryManager(this.vaultManager, this.parser);
		this.contextAssembler = new ContextAssembler(this.vaultManager, this.parser, this.memoryManager);
		this.soulManager = new SoulManager(this.vaultManager, this.parser);
		this.sessionManager = new SessionManager(
			this.vaultManager,
			this.parser,
			this.taxonomyManager,
			() => this.settings.apiKey,
			() => this.settings.modelSlug,
			() => this.settings.language,
		);

		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

		this.addCommand({
			id: 'open-agent-chat',
			name: 'Open agent chat',
			callback: () => this.openChatView(),
		});

		this.addCommand({
			id: 'create-soul',
			name: 'Create new soul',
			callback: () => {
				new SoulGeneratorModal(
					this.app,
					this.vaultManager,
					this.parser,
					this.settings.apiKey,
					this.settings.modelSlug,
					() => {},
					this.settings.language,
				).open();
			},
		});

		this.addRibbonIcon('message-square', 'Open agent chat', () => this.openChatView());

		this.addSettingTab(new AgentSettingTab(this.app, this));

		this.statusBarTokenEl = this.addStatusBarItem();
		this.statusBarTokenEl.addClass('agent-status-tokens');

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateStatusBarTokens();
			}),
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!(file instanceof TFile)) return;
				if (file !== this.app.workspace.getActiveFile()) return;
				if (this.statusBarTimer !== null) window.clearTimeout(this.statusBarTimer);
				this.statusBarTimer = window.setTimeout(() => {
					this.statusBarTimer = null;
					this.updateStatusBarTokens();
				}, 500);
			}),
		);

		this.registerVaultHooks();

		this.app.workspace.onLayoutReady(() => {
			if (SetupWizard.isFirstRun(this.app)) {
				new SetupWizard(this.app, this, this.vaultManager).open();
			}
			void this.memoryManager.autoMarkStale();
			void this.cleanupTraces();
			void this.cacheCoreFiles();
			this.lockIcons = new LockIcons(this.app, CORE_FILES);
			this.lockIcons.setup();
			this.updateStatusBarTokens();
		});
	}

	onunload() {
		if (this.statusBarTimer !== null) window.clearTimeout(this.statusBarTimer);
		this.lockIcons?.destroy();
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

				// No pending-folder logic needed: confirmation is state-based (handled in modify hook)
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

				// Candidate discarded: user deleted a memory item
				if (!file.path.includes('memory/items/') || file.path.endsWith('.base')) return;
				const cachedFm = this.app.metadataCache.getCache(file.path)?.frontmatter;
				const state = String(cachedFm?.['state'] ?? '');
				if (!state.includes('pending')) return;
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

				// Item edited: invalidate score cache + update taxonomy if newly confirmed
				if (!file.path.includes('memory/items/') || file.path.endsWith('.base')) return;
				this.memoryManager.reindex(file.path);
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter as Partial<MemoryItemFrontmatter> | undefined;
				if (!fm) return;
				const state = String(fm.state ?? '');
				if (state.includes('pending')) return;
				const proposedTags = fm.proposed_tags;
				if (Array.isArray(proposedTags) && proposedTags.length > 0) {
					void this.taxonomyManager.addToActive(proposedTags);
				}
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

	// — Pricing cache —

	async getModelPricing(): Promise<ModelPricing | null> {
		const slug = this.settings.modelSlug;
		if (!slug || !this.settings.apiKey) return null;
		const cached = this.pricingCache.get(slug);
		if (cached && Date.now() - cached.fetchedAt < MinimalAgentPlugin.PRICING_TTL_MS) {
			return cached.pricing;
		}
		try {
			const pricing = await OpenRouterClient.fetchPricing(slug, this.settings.apiKey);
			this.pricingCache.set(slug, { pricing, fetchedAt: Date.now() });
			return pricing;
		} catch {
			return null;
		}
	}

	// — Status bar token count —

	private updateStatusBarTokens(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			this.statusBarTokenEl.setText('');
			return;
		}
		const tokens = countTokens(view.editor.getValue());
		this.statusBarTokenEl.setText(`~${tokens.toLocaleString()} tokens`);
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
