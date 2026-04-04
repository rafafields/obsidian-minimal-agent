import { App, TFile, TFolder } from 'obsidian';

export class VaultManager {
	constructor(private app: App) {}

	async ensurePath(folderPath: string): Promise<void> {
		const parts = folderPath.split('/').filter(p => p.length > 0);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Folder may have been created concurrently
				}
			}
		}
	}

	async readFile(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return await this.app.vault.read(file);
	}

	async writeFile(path: string, content: string): Promise<void> {
		const parentPath = path.substring(0, path.lastIndexOf('/'));
		if (parentPath) await this.ensurePath(parentPath);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
	}

	async appendToFile(path: string, content: string): Promise<void> {
		const existing = await this.readFile(path);
		if (existing === null) {
			await this.writeFile(path, content);
		} else {
			await this.writeFile(path, existing + content);
		}
	}

	fileExists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}

	listFiles(folderPath: string): string[] {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return [];
		return folder.children
			.filter((f): f is TFile => f instanceof TFile)
			.map(f => f.path);
	}
}
